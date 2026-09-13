using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    public enum EnemyKind { Cover, Patrol, Tree, Rusher }

    public struct EnemySpawn
    {
        public Vector2 Pos;      // (x, z)
        public Vector2 PosB;     // 순찰 종점 (Patrol 전용)
        public EnemyKind Kind;
        public EnemyRole Role;
        public int UniformVariant;
        public float SurfaceY; // NaN uses terrain; a fixed height anchors stationary rooftop posts.

        public EnemySpawn(float x, float z, EnemyKind kind, float bx = 0f, float bz = 0f, EnemyRole role = EnemyRole.Automatic, int uniformVariant = 0, float surfaceY = float.NaN)
        {
            Pos = new Vector2(x, z);
            PosB = new Vector2(bx, bz);
            Kind = kind;
            Role = role;
            UniformVariant = uniformVariant;
            SurfaceY = surfaceY;
        }
    }

    /// <summary>
    /// 적 병사.
    ///  - Cover : 바위 뒤에 웅크렸다가 주기적으로 몸을 일으킨다.
    ///  - Tree  : 굵은 나무 뒤에 숨었다가 옆으로 몸을 내민다.
    ///  - Patrol: 두 지점 사이를 오간다.
    ///  - Rusher: 플레이어를 향해 돌진하며 중간중간 멈춰 사격한다 (방어전).
    /// </summary>
    public class EnemySoldier : MonoBehaviour
    {
        public const float SniperModeScale = 2.3f;   // 저격 임무의 적 크기 배율
        public const float DefenseModeScale = 1.8f;  // 방어전 적 크기 배율
        const float CrouchFactor = 0.5f;
        const float PeekSlide = 0.85f;
        const float MaxHealth = 100f;

        public EnemyKind Kind;
        public Vector3 PointA, PointB;
        public EnemyRole Role { get; private set; }
        public int UniformVariant { get; private set; }
        public string RoleName => EnemyCombatRoles.Name(Role);
        public bool OnRoof => !float.IsNaN(surfaceY);
        float surfaceY = float.NaN;
        public float GroundHeight(float x, float z)
        {
            if(OnRoof)return surfaceY;
            if(gm!=null && gm.Mission==MissionType.Assault && UnityEngine.AI.NavMesh.SamplePosition(
                new Vector3(x,transform.position.y,z),out var ground,1f,UnityEngine.AI.NavMesh.AllAreas))return ground.position.y;
            return TerrainGenerator.GroundHeight(terrain,x,z);
        }
        public Vector3 RightGrip => EnemyCombatRoles.RightGrip(Role);
        public Vector3 LeftGrip => EnemyCombatRoles.LeftGrip(Role);

        public bool IsDead { get; private set; }
        public bool IsAware { get; private set; }
        public float Health { get; private set; } = MaxHealth;
        public Transform Head => head;

        enum State { Hidden, Peeking, Walking, Waiting, Rushing, Halt }

        Transform rig, head, rifleTip;
        Terrain terrain;
        GameManager gm;
        Animator animator;
        EnemyAnimationRig motion;
        public InfantryCombat Combat { get; private set; }
        public KingBoss Boss { get; private set; }
        public Vector3 Muzzle=>rifleTip.position;
        public void ConfigureBoss(KingBoss boss){Boss=boss;Health=KingBoss.MaximumHealth;}
        public void BossRecoil(){if(motion!=null)motion.Fire();}
        public void AttachCombat(InfantryCombat combat){Combat=combat;}
        public bool IsAlly => Combat!=null && Combat.Ally;
        public Vector3 AimPoint => head!=null?head.position-Vector3.up*.35f:transform.position+Vector3.up*1.5f;
        Vector3 CombatAim => Combat!=null?Combat.TargetPoint:gm.EnemyAimPoint;
        Transform weaponVisual;
        Vector3 previousRigPosition, lastMotionVelocity;
        float staggerTimer;
        HashSet<string> animParams;

        State state;
        float stateTimer;
        float cover, coverTarget = 1f;
        int peekSide = 1;
        Vector3 walkTarget;
        Vector3 faceDir = Vector3.forward;
        float nextShotTime;
        bool preparingShot;
        float aimTimer;
        int roundsRemaining;
        float burstSpread;
        Vector3 plannedTarget;
        float scale = 1f;

        // Rusher 전용
        float burstTimer, zigzagPhase, avoidTimer;
        int avoidSide = 1;
        float moveSpeed;

        // ---------- 생성 ----------

        public static EnemySoldier Create(string name, Terrain terrain, EnemySpawn spawn, Vector3 playerPos, float scale,
                                          Material body, Material skin, Material gear, Material rock, System.Random rng, bool createCover = true)
        {
            Vector3 ground = TerrainGenerator.OnGround(terrain, spawn.Pos.x, spawn.Pos.y);
            if (!float.IsNaN(spawn.SurfaceY)) ground.y = spawn.SurfaceY;
            Vector3 toPlayer = playerPos - ground;
            toPlayer.y = 0f;
            toPlayer.Normalize();

            var root = new GameObject(name);
            root.transform.position = ground;
            root.transform.rotation = Quaternion.LookRotation(toPlayer);
            root.transform.localScale = Vector3.one * scale;

            var rigGo = new GameObject("Rig");
            rigGo.transform.SetParent(root.transform, false);

            var soldier = root.AddComponent<EnemySoldier>();
            soldier.Kind = spawn.Kind;
            soldier.Role = EnemyCombatRoles.Resolve(spawn);
            soldier.UniformVariant = Mathf.Clamp(spawn.UniformVariant, 0, EnemyCombatRoles.GunnerColors - 1);
            soldier.terrain = terrain;
            soldier.surfaceY = spawn.SurfaceY;
            soldier.rig = rigGo.transform;
            soldier.scale = scale;
            soldier.PointA = ground;
            soldier.PointB = spawn.Kind == EnemyKind.Patrol
                ? TerrainGenerator.OnGround(terrain, spawn.PosB.x, spawn.PosB.y)
                : ground;
            soldier.peekSide = rng.NextDouble() < 0.5 ? -1 : 1;
            soldier.faceDir = toPlayer;
            soldier.zigzagPhase = (float)(rng.NextDouble() * 6.28);
            soldier.moveSpeed = 4.2f + (float)rng.NextDouble() * 1.4f;
            soldier.burstTimer = 2f + (float)rng.NextDouble() * 4f;

            BuildModel(soldier, rigGo.transform, body, skin, gear);

            if (createCover && spawn.Kind == EnemyKind.Cover)
            {
                var rockGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
                rockGo.name = name + "_Cover";
                rockGo.transform.position = ground + toPlayer * (1.15f * scale) + Vector3.up * (0.25f * scale);
                rockGo.transform.rotation = Quaternion.LookRotation(toPlayer) * Quaternion.Euler(0f, (float)(rng.NextDouble() * 10.0 - 5.0), 0f);
                rockGo.transform.localScale = new Vector3(1.9f, 1.7f, 0.9f) * scale;
                rockGo.GetComponent<Renderer>().material = rock;
                for (int i = 0; i < 3; i++)
                {
                    var pebble = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    pebble.name = "Pebble";
                    Vector3 side = Vector3.Cross(Vector3.up, toPlayer);
                    Vector3 pp = rockGo.transform.position + side * (float)((rng.NextDouble() - 0.5) * 3.0 * scale) + toPlayer * 0.6f;
                    pp.y = TerrainGenerator.GroundHeight(terrain, pp.x, pp.z) + 0.1f;
                    pebble.transform.position = pp;
                    float ps = (float)(0.4 + rng.NextDouble() * 0.6) * scale;
                    pebble.transform.localScale = new Vector3(ps, ps * 0.6f, ps * 0.8f);
                    pebble.GetComponent<Renderer>().material = rock;
                }
            }
            else if (createCover && spawn.Kind == EnemyKind.Tree)
            {
                float trunkDiameter = 0.95f * scale;
                Vector3 treePos = ground + toPlayer * (1.05f * scale);
                treePos.y = TerrainGenerator.GroundHeight(terrain, treePos.x, treePos.z) - 0.3f;
                Vegetation.CoverTree(null, treePos, trunkDiameter, 1.1f);
            }

            return soldier;
        }

        static void BuildModel(EnemySoldier soldier, Transform rig, Material body, Material skin, Material gear)
        {
            // ----- 히트박스 겸 기본 모델 (프리미티브) -----
            var parts = new List<GameObject>();
            for (int i = -1; i <= 1; i += 2)
            {
                var leg = Part(PrimitiveType.Capsule, rig, "Leg", new Vector3(0.13f * i, 0.42f, 0f), new Vector3(0.24f, 0.42f, 0.24f), Quaternion.identity, body, parts);
                Hitbox(leg, soldier, false);
            }
            var torso = Part(PrimitiveType.Capsule, rig, "Torso", new Vector3(0f, 1.15f, 0f), new Vector3(0.56f, 0.42f, 0.4f), Quaternion.identity, body, parts);
            Hitbox(torso, soldier, false);
            var pack = Part(PrimitiveType.Cube, rig, "Backpack", new Vector3(0f, 1.2f, -0.27f), new Vector3(0.38f, 0.42f, 0.2f), Quaternion.identity, gear, parts);
            Destroy(pack.GetComponent<Collider>());
            var armL = Part(PrimitiveType.Capsule, rig, "ArmL", new Vector3(-0.12f, 1.28f, 0.28f), new Vector3(0.14f, 0.26f, 0.14f), Quaternion.Euler(80f, 0f, 20f), body, parts);
            Destroy(armL.GetComponent<Collider>());
            var armR = Part(PrimitiveType.Capsule, rig, "ArmR", new Vector3(0.24f, 1.22f, 0.18f), new Vector3(0.14f, 0.24f, 0.14f), Quaternion.Euler(70f, 0f, -25f), body, parts);
            Destroy(armR.GetComponent<Collider>());
            var headGo = Part(PrimitiveType.Sphere, rig, "Head", new Vector3(0f, 1.72f, 0f), new Vector3(0.3f, 0.3f, 0.3f), Quaternion.identity, skin, parts);
            Hitbox(headGo, soldier, true);
            soldier.head = headGo.transform;
            var helmet = Part(PrimitiveType.Sphere, rig, "Helmet", new Vector3(0f, 1.79f, -0.01f), new Vector3(0.36f, 0.27f, 0.37f), Quaternion.identity, gear, parts);
            Destroy(helmet.GetComponent<Collider>());
            var rifle = Part(PrimitiveType.Cube, rig, "Rifle", new Vector3(0.1f, 1.32f, 0.25f), new Vector3(0.06f, 0.08f, 0.7f), Quaternion.identity, gear, parts);
            Destroy(rifle.GetComponent<Collider>());
            soldier.weaponVisual = rifle.transform;
            var mag = Part(PrimitiveType.Cube, rifle.transform, "Magazine", new Vector3(0f, -1.1f, 0.05f), new Vector3(0.8f, 1.6f, 0.12f), Quaternion.identity, gear, parts);
            Destroy(mag.GetComponent<Collider>());
            var tip = new GameObject("Tip");
            tip.transform.SetParent(rifle.transform, false);
            tip.transform.localPosition = new Vector3(0f, 0f, 0.5f);
            soldier.rifleTip = tip.transform;

            // Role equipment: the sniper carries a scoped rifle; gunners carry a belt-fed LMG.
            var rifleModel = Application.isMobilePlatform ? null : WeaponModels.LoadPrefab(EnemyCombatRoles.Model(soldier.Role));
            if (rifleModel != null)
            {
                rifle.GetComponent<Renderer>().enabled = false;
                mag.GetComponent<Renderer>().enabled = false;
                var inst = Instantiate(rifleModel, rig);
                inst.name = soldier.RoleName + "_Weapon";
                soldier.weaponVisual = inst.transform;
                inst.transform.localPosition = new Vector3(0.12f, 1.3f, 0.3f);
                inst.transform.localRotation = Quaternion.identity;
                inst.transform.localScale = Vector3.one;
                foreach (var c in inst.GetComponentsInChildren<Collider>()) { c.enabled = false; Destroy(c); }
                var muzzle = WeaponModels.FindMuzzle(inst);
                if (muzzle != null) soldier.rifleTip = muzzle;
                // (parts 에 넣지 않는다: 실사 병사 모델이 있어도 소총은 계속 보여야 한다)
            }

            var uniformBlock = new MaterialPropertyBlock();
            uniformBlock.SetColor("_Color", EnemyCombatRoles.Uniform(soldier.Role, soldier.UniformVariant));
            foreach (var part in parts)
                if (part.name == "Torso" || part.name == "Helmet" || part.name == "Leg" || part.name.StartsWith("Arm"))
                    part.GetComponent<Renderer>().SetPropertyBlock(uniformBlock);

            // ----- 사용자 모델 (있으면 프리미티브 렌더러를 끄고 그 위에 덮는다) -----
            var custom = EnemyModels.Prefab;
            if (custom != null)
            {
                // Keep the FBX's authored root rotation/scale. Its animation also keys that root;
                // size/facing corrections belong on a separate, unanimated parent.
                var modelRoot = new GameObject("AnimatedModelRoot").transform;
                modelRoot.SetParent(rig, false);
                modelRoot.localRotation = Quaternion.Euler(0f, EnemyModels.YawOffset, 0f);
                var inst = Instantiate(custom, modelRoot, false);
                inst.name = "Model";
                EnemyCombatRoles.ApplyUniform(inst, soldier.Role, soldier.UniformVariant);
                // 키를 약 1.85m 로 맞춘다
                var rends = inst.GetComponentsInChildren<Renderer>();
                if (rends.Length > 0)
                {
                    Bounds b = rends[0].bounds;
                    foreach (var r in rends) b.Encapsulate(r.bounds);
                    float h = b.size.y;
                    if (h > 0.01f) modelRoot.localScale = Vector3.one * (1.85f * soldier.scale / h);   // bounds 는 월드 크기이므로 루트 스케일 보정
                }
                foreach (var go in parts)
                {
                    var r = go.GetComponent<Renderer>();
                    if (r != null) r.enabled = false;
                }
                soldier.animator = inst.GetComponentInChildren<Animator>();
                if (soldier.animator != null)
                {
                    soldier.animParams = new HashSet<string>();
                    foreach (var prm in soldier.animator.parameters) soldier.animParams.Add(prm.name);
                }
                soldier.motion = inst.GetComponent<EnemyAnimationRig>();
                if (soldier.motion != null && soldier.motion.Initialize(soldier, rig, soldier.terrain, soldier.weaponVisual))
                {
                    soldier.motion.BindHitboxes(parts);
                    soldier.head = soldier.motion.AnimatedHead;
                }
                else soldier.motion = null;
            }
        }

        static GameObject Part(PrimitiveType type, Transform parent, string name, Vector3 pos, Vector3 scale, Quaternion rot, Material mat, List<GameObject> list)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            go.transform.localRotation = rot;
            go.GetComponent<Renderer>().material = mat;
            list.Add(go);
            return go;
        }

        static void Hitbox(GameObject go, EnemySoldier owner, bool head)
        {
            var hb = go.AddComponent<EnemyHitbox>();
            hb.Owner = owner;
            hb.IsHead = head;
        }

        // ---------- 수명주기 ----------

        void Start()
        {
            gm = GameManager.Instance;
            Combat=GetComponent<InfantryCombat>();
            if (gm.Mission != MissionType.Sniper) IsAware = true;
            switch (Kind)
            {
                case EnemyKind.Patrol:
                    state = State.Walking;
                    walkTarget = PointB;
                    cover = coverTarget = 0f;
                    break;
                case EnemyKind.Rusher:
                    state = State.Rushing;
                    cover = coverTarget = 0f;
                    IsAware = true;
                    break;
                default:
                    state = State.Hidden;
                    stateTimer = Random.Range(0.5f, 4f);
                    cover = coverTarget = 1f;
                    break;
            }
            ApplyCover();
            previousRigPosition = rig.position;
            if (motion != null)
                motion.Drive(0f, cover, peekSide, false, gm.PlayerEye.position, 1f);
        }

        void Update()
        {
            if (IsDead || gm == null || !gm.IsPlaying) return;
            float dt = Time.deltaTime;
            staggerTimer = Mathf.Max(0f, staggerTimer - dt);

            // A full cover transition takes about a second so the feet can step and settle.
            float coverRate = Kind == EnemyKind.Tree ? 1.05f : Kind == EnemyKind.Cover ? 1.15f : 2.5f;
            cover = Mathf.MoveTowards(cover, coverTarget, dt * coverRate);
            ApplyCover();

            float speedForAnim = 0f;
            if(Combat!=null)
            {
                Combat.Tick(dt);coverTarget=Combat.Crouch;
                Combat.RecordOpportunity(dt);
                if(!Combat.Post)MoveOnTerrain(Combat.Direction,Combat.Speed,dt);
                speedForAnim=Combat.Speed;
                state=Combat.CanShoot?State.Peeking:Combat.Crouch>.7f?State.Hidden:State.Rushing;
                Vector3 direction=Combat.LookPoint-transform.position;direction.y=0;
                if(direction.sqrMagnitude>.001f)faceDir=direction.normalized;
                if(!Combat.CanShoot)preparingShot=false;
                else if(Boss==null)TryShoot(Combat.Speed>.1f?1.5f:.75f,IsAlly?1.1f:1.8f,IsAlly?2.0f:3.1f);
            }
            else switch (state)
            {
                case State.Hidden:
                    coverTarget = 1f;
                    stateTimer -= dt;
                    if (stateTimer <= 0f && cover >= .999f)
                    {
                        if (Kind == EnemyKind.Tree && Random.value < .4f) peekSide = -peekSide;
                        state = State.Peeking;
                        stateTimer = IsAware ? Random.Range(3.2f, 4.5f) : Random.Range(2.5f, 5f);
                        nextShotTime = Time.time + Random.Range(0.6f, 1.2f);
                    }
                    break;

                case State.Peeking:
                    coverTarget = 0f;
                    stateTimer -= dt;
                    if (IsAware) TryShoot(.85f);
                    if (stateTimer <= 0f)
                    {
                        state = State.Hidden;
                        stateTimer = IsAware ? Random.Range(4f, 9f) : Random.Range(2f, 5f);
                    }
                    break;

                case State.Walking:
                    {
                        coverTarget = 0f;
                        float speed = IsAware ? 3.4f : 1.4f;
                        Vector3 to = walkTarget - transform.position;
                        to.y = 0f;
                        if (to.magnitude < 0.3f)
                        {
                            state = State.Waiting;
                            stateTimer = IsAware ? Random.Range(1.2f, 2.5f) : Random.Range(1.5f, 4f);
                            nextShotTime = Time.time + Random.Range(0.3f, 0.8f);
                        }
                        else
                        {
                            MoveOnTerrain(to.normalized, speed, dt);
                            faceDir = to.normalized;
                            speedForAnim = speed;
                        }
                        break;
                    }

                case State.Waiting:
                    coverTarget = 0f;
                    stateTimer -= dt;
                    if (IsAware) TryShoot(.85f);
                    if (stateTimer <= 0f)
                    {
                        walkTarget = (walkTarget == PointA) ? PointB : PointA;
                        state = State.Walking;
                    }
                    break;

                case State.Rushing:
                    speedForAnim = UpdateRushing(dt);
                    TryShoot(1.6f, 1.8f, 3f);
                    break;

                case State.Halt:
                    coverTarget = 0.55f;   // 무릎쏴
                    stateTimer -= dt;
                    TryShoot(.72f, 1.0f, 1.8f);
                    if (stateTimer <= 0f)
                    {
                        state = State.Rushing;
                        burstTimer = Random.Range(3f, 7f);
                    }
                    break;
            }

            if (Combat==null && state != State.Walking && state != State.Rushing)
            {
                Vector3 d = (gm.Armor != null ? gm.EnemyAimPoint : gm.PlayerEye.position) - transform.position;
                d.y = 0f;
                if (d.sqrMagnitude > 0.01f) faceDir = d.normalized;
            }
            transform.rotation = Quaternion.RotateTowards(transform.rotation, Quaternion.LookRotation(faceDir), 360f * dt);

            UpdatePreparedShot(dt);

            lastMotionVelocity = Vector3.ClampMagnitude(Vector3.ProjectOnPlane(rig.position - previousRigPosition, Vector3.up) / Mathf.Max(dt, .0001f), 9f * scale);
            float actualSpeed = lastMotionVelocity.magnitude;
            previousRigPosition = rig.position;
            if (motion != null)
                motion.Drive(actualSpeed, cover, peekSide,
                    IsAware && (Combat!=null?Combat.CanShoot: preparingShot || state != State.Walking && state != State.Rushing),
                    preparingShot ? plannedTarget : Combat!=null?Combat.LookPoint: gm.EnemyAimPoint, dt);
            else if (animator != null)
            {
                SetAnim("Speed", speedForAnim);
                SetAnim("Crouch", cover > 0.4f);
            }
        }

        /// <summary>플레이어를 향해 지그재그로 달리며, 장애물을 피하고, 가끔 멈춰서 사격한다.</summary>
        float UpdateRushing(float dt)
        {
            coverTarget = 0f;
            Vector3 toPlayer = gm.PlayerEye.position - transform.position;
            toPlayer.y = 0f;
            float dist = toPlayer.magnitude;
            Vector3 dir = toPlayer.normalized;

            // Close to 7 m before holding position and firing.
            if (dist < 7f && (gm.Mission != MissionType.Assault || HasLineOfSight()))
            {
                state = State.Halt;
                stateTimer = Random.Range(1.5f, 3f);
                nextShotTime = Time.time + 0.2f;
                return 0f;
            }

            if (gm.Mission == MissionType.Assault)
            {
                var navigation=GetComponent<AssaultNavigation>();
                Vector3 route=navigation!=null?navigation.Direction(gm.Player.transform.position):Vector3.zero;
                MoveOnTerrain(route,preparingShot?2.1f:3.1f,dt);faceDir=preparingShot?toPlayer.normalized:route.sqrMagnitude>.001f?route:faceDir;
                return route.sqrMagnitude>.001f?3.1f:0f;
            }
            // 지그재그
            float zig = Mathf.Sin(Time.time * 1.3f + zigzagPhase) * 28f;
            dir = Quaternion.Euler(0f, zig, 0f) * dir;

            // 장애물 회피 (나무, 바위)
            if (avoidTimer > 0f)
            {
                avoidTimer -= dt;
                dir = Quaternion.Euler(0f, 70f * avoidSide, 0f) * dir;
            }
            else if (Physics.Raycast(transform.position + Vector3.up * 1f, dir, out RaycastHit hit, 3.5f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore)
                     && hit.collider.GetComponent<TerrainCollider>() == null
                     && hit.collider.GetComponent<EnemyHitbox>() == null)
            {
                avoidSide = Random.value < 0.5f ? -1 : 1;
                avoidTimer = 0.7f;
                dir = Quaternion.Euler(0f, 70f * avoidSide, 0f) * dir;
            }

            float advancingSpeed = preparingShot ? moveSpeed * .65f : moveSpeed;
            MoveOnTerrain(dir, advancingSpeed, dt);
            faceDir = preparingShot ? toPlayer.normalized : dir;

            // 사격을 위해 잠시 정지
            burstTimer -= dt;
            if (burstTimer <= 0f && dist < 160f && HasLineOfSight())
            {
                state = State.Halt;
                stateTimer = Random.Range(1.2f, 2.2f);
                nextShotTime = Time.time + 0.3f;
            }
            return advancingSpeed;
        }

        void MoveOnTerrain(Vector3 dir, float speed, float dt)
        {
            if (staggerTimer > 0f) speed *= .25f;
            if (gm != null && gm.Mission == MissionType.Assault)
            {
                var navigation=GetComponent<AssaultNavigation>();if(navigation!=null)navigation.Move(dir,speed,dt);return;
            }
            Vector3 p = transform.position + dir * speed * dt;
            float half = TerrainGenerator.Size * 0.5f - 5f;
            p.x = Mathf.Clamp(p.x, -half, half);
            if (gm != null && gm.Map == BattlefieldMap.City && gm.Mission==MissionType.Defense && Kind == EnemyKind.Rusher)
                p.x = Mathf.Clamp(p.x, -8f, 8f);
            p.z = Mathf.Clamp(p.z, -half, half);
            p.y = GroundHeight(p.x, p.z);
            transform.position = p;
        }

        void ApplyCover()
        {
            if (motion != null)
            {
                // Skeletal crouch/lean and bone hitboxes replace whole-model sinking/scaling.
                rig.localScale = Vector3.one;
                rig.localPosition = Vector3.zero;
                return;
            }
            if (Kind == EnemyKind.Tree)
            {
                rig.localScale = Vector3.one;
                rig.localPosition = new Vector3(peekSide * PeekSlide * (1f - cover), 0f, 0f);
            }
            else
            {
                if (animator != null && animParams != null && animParams.Contains("Crouch"))
                {
                    // 웅크리기 애니메이션이 있으면 히트박스만 살짝 줄인다
                    rig.localPosition = Vector3.zero;
                    rig.localScale = new Vector3(1f, 1f - 0.25f * cover, 1f);
                }
                else if (animator != null)
                {
                    // 웅크리기 클립이 없는 실사 모델: 찌그러뜨리는 대신 몸을 낮춘다 (땅에 가라앉힘)
                    rig.localScale = Vector3.one;
                    rig.localPosition = new Vector3(0f, -0.95f * cover, 0f);
                }
                else
                {
                    rig.localPosition = Vector3.zero;
                    rig.localScale = new Vector3(1f, 1f - (1f - CrouchFactor) * cover, 1f);
                }
            }
        }

        void SetAnim(string name, float v)
        {
            if (animParams != null && animParams.Contains(name)) animator.SetFloat(name, v);
        }

        void SetAnim(string name, bool v)
        {
            if (animParams != null && animParams.Contains(name)) animator.SetBool(name, v);
        }

        // ---------- 반응 ----------

        public void SetAware()
        {
            if (IsDead) return;
            if (!IsAware) nextShotTime = Time.time + Random.Range(.8f, 1.5f);
            if (!IsAware && (Kind == EnemyKind.Cover || Kind == EnemyKind.Tree) && state == State.Peeking)
                stateTimer = Mathf.Min(stateTimer, Random.Range(0.3f, 1f));
            IsAware = true;
        }

        public void Alert(float hideTime)
        {
            if (IsDead) return;
            SetAware();
            if(Combat!=null){Combat.Suppress();return;}
            if (Kind == EnemyKind.Cover || Kind == EnemyKind.Tree)
            {
                state = State.Hidden;
                stateTimer = Mathf.Max(stateTimer, hideTime);
            }
            else if (state == State.Waiting)
            {
                stateTimer = 0f;
            }
        }

        /// <summary>피격. 사망하면 true.</summary>
        public bool TakeHit(float damage, bool headshot, Vector3 bulletDir)
        {
            if (IsDead) return false;
            Health -= Boss!=null ? Boss.AbsorbHit(damage,headshot) : damage*(headshot?3f:1f);
            staggerTimer = Boss!=null?0f:.18f;
            if (motion != null) motion.Hit(bulletDir);
            SetAware();
            if (Health <= 0f)
            {
                Kill(headshot, bulletDir);
                return true;
            }
            if(Boss!=null)return false;
            if(Combat!=null)Combat.Suppress();
            // 부상: 돌격 중이면 잠깐 멈칫, 엄폐형이면 숨는다
            if (Kind == EnemyKind.Rusher)
            {
                burstTimer = Mathf.Min(burstTimer, 0.5f);
            }
            else if (Kind != EnemyKind.Patrol)
            {
                Alert(Random.Range(2f, 4f));
            }
            return false;
        }

        public void Kill(bool headshot, Vector3 bulletDir)
        {
            if (IsDead) return;
            IsDead = true;
            Health = 0f;
            if(gm!=null && gm.Assault!=null)gm.Assault.OnSoldierKilled(this);
            var navigation=GetComponent<AssaultNavigation>();if(navigation!=null)navigation.enabled=false;
            var marker=transform.Find("Friendly blue marker");if(marker!=null)marker.gameObject.SetActive(false);
            if(IsAlly && gm!=null)gm.Hud.Announce(name+" 전사 · 남은 동료 "+gm.Assault.AlliesAlive+"명");
            foreach (var c in GetComponentsInChildren<Collider>()) c.enabled = false;
            if (motion != null) motion.Die(bulletDir, headshot, motion.AnimatedVelocity);
            else
            {
                if (animator != null) SetAnim("Dead", true);
                StartCoroutine(FallDown(bulletDir));
            }
            if (gm != null && gm.Mission == MissionType.Defense) Destroy(gameObject, 25f);
            if (gm != null && gm.Mission == MissionType.Assault) Destroy(gameObject, 35f);
        }

        IEnumerator FallDown(Vector3 bulletDir)
        {
            if (animator != null && animParams != null && animParams.Contains("Dead")) yield break; // 애니메이션이 처리
            Vector3 flat = bulletDir;
            flat.y = 0f;
            if (flat.sqrMagnitude < 0.001f) flat = transform.forward;
            flat.Normalize();
            Vector3 axis = Vector3.Cross(Vector3.up, flat);
            Quaternion start = rig.rotation;
            Quaternion end = Quaternion.AngleAxis(88f, axis) * start;
            Vector3 startScale = rig.localScale;
            float t = 0f;
            while (t < 0.5f)
            {
                t += Time.deltaTime;
                float k = Mathf.SmoothStep(0f, 1f, t / 0.5f);
                rig.rotation = Quaternion.Slerp(start, end, k);
                rig.localScale = Vector3.Lerp(startScale, Vector3.one, k);
                yield return null;
            }
            rig.rotation = end;
        }

        // ---------- 사격 ----------

        void TryShoot(float spreadRadius, float minInterval = 2.2f, float maxInterval = 4.2f)
        {
            if (preparingShot || Time.time < nextShotTime || !gm.PositionRevealed || staggerTimer > 0f) return;
            if (cover > .7f || (motion != null && !motion.CanFireFromPose) || !HasLineOfSight()) return;
            if (!IsAlly && !gm.TryBeginEnemyAttack()) return;
            bool sniper = Role == EnemyRole.Sniper || Role == EnemyRole.RocketTrooper;
            nextShotTime = Time.time + (sniper ? Random.Range(5f, 8f) : Random.Range(minInterval, maxInterval));
            roundsRemaining = EnemyCombatRoles.Rounds(Role);
            burstSpread = sniper ? .4f : spreadRadius;
            Vector3 target = CombatAim;
            aimTimer = EnemyCombatRoles.AimTime(Role);
            if(!IsAlly&&Role==EnemyRole.RocketTrooper&&gm.Mission==MissionType.Helicopter&&gm.Flight!=null)
            {
                // Lead the normal orbit so simply sitting still is dangerous. A dodge after the
                // warning moves the helicopter off this fixed intercept point.
                float intercept=aimTimer+Vector3.Distance(rifleTip.position,target)/55f;
                for(int i=0;i<3;i++)
                {
                    target=gm.Flight.PredictPlayerAimPoint(intercept);
                    intercept=aimTimer+Vector3.Distance(rifleTip.position,target)/55f;
                }
            }
            Vector3 forward = (target - rifleTip.position).normalized;
            Vector3 right = Vector3.Cross(Vector3.up, forward).normalized;
            Vector3 up = Vector3.Cross(forward, right).normalized;
            Vector2 spread = Random.insideUnitCircle * burstSpread;
            plannedTarget = target + right * spread.x + up * spread.y;
            preparingShot = true;
            float warning=aimTimer+(roundsRemaining-1)*EnemyCombatRoles.BurstInterval+(Role==EnemyRole.RocketTrooper?Vector3.Distance(rifleTip.position,target)/55f:CounterfireRules.FlightSeconds(Vector3.Distance(rifleTip.position,target)));
            if(!IsAlly && (Combat==null || Combat.TargetsPlayer))gm.Hud.WarnIncoming(transform.position,warning,RoleName);
            if(!IsAlly&&Role==EnemyRole.RocketTrooper&&gm.Mission==MissionType.Helicopter&&gm.Flight!=null)gm.Flight.NotifyRocket(warning);
        }

        void UpdatePreparedShot(float dt)
        {
            if (!preparingShot) return;
            // Ducking does not retarget a prepared shot. It continues towards the old position.
            if (!gm.PositionRevealed || cover > .7f || staggerTimer > 0f ||
                ((Kind == EnemyKind.Tree || Kind == EnemyKind.Cover) && state != State.Peeking) ||
                (motion != null && !motion.CanFireFromPose))
            {
                preparingShot = false;
                return;
            }
            aimTimer -= dt;
            if (aimTimer > 0f) return;
            // Freeze the burst's aim point, so ducking or moving after the warning remains useful.
            // Recheck world cover between rounds instead of firing through a newly obstructed muzzle.
            if (ShotBlocked(rifleTip.position, plannedTarget))
            {
                preparingShot = false;
                return;
            }
            Vector3 target = plannedTarget;
            if (Role == EnemyRole.MachineGunner)
            {
                Vector3 forward = (target - rifleTip.position).normalized;
                Vector3 right = Vector3.Cross(Vector3.up, forward).normalized;
                Vector3 up = Vector3.Cross(forward, right);
                Vector2 spread = Random.insideUnitCircle * (burstSpread * .35f);
                target += right * spread.x + up * spread.y;
            }
            FireAtPlayer(target);
            roundsRemaining--;
            preparingShot = roundsRemaining > 0;
            aimTimer = EnemyCombatRoles.BurstInterval;
        }

        bool HasLineOfSight() => CanSee(CombatAim);

        public bool CanSee(Vector3 target)
        {
            Vector3 from = head.position + transform.forward * (.3f * scale);
            return !ShotBlocked(from, target);
        }

        bool ShotBlocked(Vector3 from, Vector3 target)
        {
            if (Role == EnemyRole.RocketTrooper && gm.Armor != null)
                return ArmorProjectile.Obstructed(from,target,transform,gm.Armor.PlayerTank);
            if(!EnemyProjectile.WorldHit(from,target,this,out var hit))return false;
            var hitbox=hit.collider.GetComponent<EnemyHitbox>();
            return Combat==null || hitbox==null || hitbox.Owner!=Combat.Target;
        }

        void FireAtPlayer(Vector3 target)
        {
            if (motion != null) motion.Fire();
            Vector3 muzzle = rifleTip.position;
            Effects.Flash(muzzle, new Color(1f, .8f, .5f), 4f, 6f, .06f);
            CombatVfx.MuzzleFlash(muzzle, target - muzzle, Role == EnemyRole.RocketTrooper ? 1.7f : 1.1f);
            if(Role==EnemyRole.RocketTrooper && (Combat!=null || gm.Mission==MissionType.Helicopter))
            {
                InfantryRocket.Launch(this,muzzle,target);gm.PlaySound(gm.Sounds.RocketLaunch,.45f);return;
            }
            if (Role == EnemyRole.RocketTrooper && gm.Armor != null)
            {
                ArmorProjectile.Launch(muzzle,(target-muzzle).normalized,transform,false,45f,55f,true);
                gm.PlaySound(gm.Sounds.RocketLaunch,.28f);return;
            }
            float damage = Role == EnemyRole.Sniper ? Random.Range(24f, 30f) : Random.Range(6f, 9f);
            if(gm.Mission==MissionType.Assault)damage*=.65f;
            if(IsAlly)damage=Role==EnemyRole.Sniper?55f:18f;
            EnemyProjectile.Launch(gm, this, muzzle, target, damage);
            gm.StartCoroutine(gm.EnemyShotSound(muzzle, EnemyCombatRoles.Sound(Role)));
        }
    }
}
