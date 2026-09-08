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

        public EnemySpawn(float x, float z, EnemyKind kind, float bx = 0f, float bz = 0f)
        {
            Pos = new Vector2(x, z);
            PosB = new Vector2(bx, bz);
            Kind = kind;
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
        public const float SniperModeScale = 2.0f;   // 저격 임무의 적 크기 배율
        public const float DefenseModeScale = 1.5f;  // 방어전 적 크기 배율
        const float CrouchFactor = 0.5f;
        const float PeekSlide = 0.85f;
        const float MaxHealth = 100f;

        public EnemyKind Kind;
        public Vector3 PointA, PointB;

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
        Transform weaponVisual;
        Vector3 previousRigPosition;
        float staggerTimer;
        HashSet<string> animParams;

        State state;
        float stateTimer;
        float cover, coverTarget = 1f;
        int peekSide = 1;
        Vector3 walkTarget;
        Vector3 faceDir = Vector3.forward;
        float nextShotTime;
        float scale = 1f;

        // Rusher 전용
        float burstTimer, zigzagPhase, avoidTimer;
        int avoidSide = 1;
        float moveSpeed;

        // ---------- 생성 ----------

        public static EnemySoldier Create(string name, Terrain terrain, EnemySpawn spawn, Vector3 playerPos, float scale,
                                          Material body, Material skin, Material gear, Material rock, System.Random rng)
        {
            Vector3 ground = TerrainGenerator.OnGround(terrain, spawn.Pos.x, spawn.Pos.y);
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
            soldier.terrain = terrain;
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

            if (spawn.Kind == EnemyKind.Cover)
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
            else if (spawn.Kind == EnemyKind.Tree)
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

            // Firearm Asset Pack 돌격소총 모델이 있으면 프리미티브 소총 대신 사용 (모바일은 성능상 제외)
            var rifleModel = Application.isMobilePlatform ? null : WeaponModels.LoadPrefab("03_assault_rifle");
            if (rifleModel != null)
            {
                rifle.GetComponent<Renderer>().enabled = false;
                mag.GetComponent<Renderer>().enabled = false;
                var inst = Instantiate(rifleModel, rig);
                inst.name = "RifleModel";
                soldier.weaponVisual = inst.transform;
                inst.transform.localPosition = new Vector3(0.12f, 1.3f, 0.3f);
                inst.transform.localRotation = Quaternion.identity;
                inst.transform.localScale = Vector3.one;
                foreach (var c in inst.GetComponentsInChildren<Collider>()) { c.enabled = false; Destroy(c); }
                var muzzle = WeaponModels.FindMuzzle(inst);
                if (muzzle != null) soldier.rifleTip = muzzle;
                // (parts 에 넣지 않는다: 실사 병사 모델이 있어도 소총은 계속 보여야 한다)
            }

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
                motion.Drive(0f, Kind == EnemyKind.Tree ? 0f : cover,
                    Kind == EnemyKind.Tree ? peekSide * (1f - cover) : 0f, false, gm.PlayerEye.position, 1f);
        }

        void Update()
        {
            if (IsDead || gm == null || !gm.IsPlaying) return;
            float dt = Time.deltaTime;
            staggerTimer = Mathf.Max(0f, staggerTimer - dt);

            cover = Mathf.MoveTowards(cover, coverTarget, dt * 2.5f);
            ApplyCover();

            float speedForAnim = 0f;
            switch (state)
            {
                case State.Hidden:
                    coverTarget = 1f;
                    stateTimer -= dt;
                    if (stateTimer <= 0f)
                    {
                        state = State.Peeking;
                        stateTimer = IsAware ? Random.Range(1.5f, 3f) : Random.Range(2.5f, 5f);
                        nextShotTime = Time.time + Random.Range(0.6f, 1.2f);
                    }
                    break;

                case State.Peeking:
                    coverTarget = 0f;
                    stateTimer -= dt;
                    if (IsAware) TryShoot(StandardHitChance());
                    if (stateTimer <= 0f)
                    {
                        state = State.Hidden;
                        stateTimer = IsAware ? Random.Range(4f, 9f) : Random.Range(2f, 5f);
                        if (Kind == EnemyKind.Tree && Random.value < 0.4f) peekSide = -peekSide;
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
                    if (IsAware) TryShoot(StandardHitChance());
                    if (stateTimer <= 0f)
                    {
                        walkTarget = (walkTarget == PointA) ? PointB : PointA;
                        state = State.Walking;
                    }
                    break;

                case State.Rushing:
                    speedForAnim = UpdateRushing(dt);
                    break;

                case State.Halt:
                    coverTarget = 0.55f;   // 무릎쏴
                    stateTimer -= dt;
                    TryShoot(RusherHitChance(), 0.35f, 0.7f);
                    if (stateTimer <= 0f)
                    {
                        state = State.Rushing;
                        burstTimer = Random.Range(3f, 7f);
                    }
                    break;
            }

            if (state != State.Walking && state != State.Rushing)
            {
                Vector3 d = gm.PlayerEye.position - transform.position;
                d.y = 0f;
                if (d.sqrMagnitude > 0.01f) faceDir = d.normalized;
            }
            transform.rotation = Quaternion.RotateTowards(transform.rotation, Quaternion.LookRotation(faceDir), 360f * dt);

            float actualSpeed = Vector3.ProjectOnPlane(rig.position - previousRigPosition, Vector3.up).magnitude / Mathf.Max(dt, .0001f);
            previousRigPosition = rig.position;
            if (motion != null)
                motion.Drive(actualSpeed, Kind == EnemyKind.Tree ? 0f : cover,
                    Kind == EnemyKind.Tree ? peekSide * (1f - cover) : 0f,
                    IsAware && state != State.Walking && state != State.Rushing, gm.PlayerEye.position, dt);
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

            // 10m 안으로는 접근하지 않고 멈춰서 사격
            if (dist < 10f)
            {
                state = State.Halt;
                stateTimer = Random.Range(1.5f, 3f);
                nextShotTime = Time.time + 0.2f;
                return 0f;
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
            else if (Physics.Raycast(transform.position + Vector3.up * 1f, dir, out RaycastHit hit, 3.5f, ~0, QueryTriggerInteraction.Ignore)
                     && hit.collider.GetComponent<TerrainCollider>() == null
                     && hit.collider.GetComponent<EnemyHitbox>() == null)
            {
                avoidSide = Random.value < 0.5f ? -1 : 1;
                avoidTimer = 0.7f;
                dir = Quaternion.Euler(0f, 70f * avoidSide, 0f) * dir;
            }

            MoveOnTerrain(dir, moveSpeed, dt);
            faceDir = dir;

            // 사격을 위해 잠시 정지
            burstTimer -= dt;
            if (burstTimer <= 0f && dist < 160f && HasLineOfSight())
            {
                state = State.Halt;
                stateTimer = Random.Range(1.2f, 2.2f);
                nextShotTime = Time.time + 0.3f;
            }
            return moveSpeed;
        }

        void MoveOnTerrain(Vector3 dir, float speed, float dt)
        {
            if (staggerTimer > 0f) speed *= .25f;
            Vector3 p = transform.position + dir * speed * dt;
            float half = TerrainGenerator.Size * 0.5f - 5f;
            p.x = Mathf.Clamp(p.x, -half, half);
            p.z = Mathf.Clamp(p.z, -half, half);
            p.y = TerrainGenerator.GroundHeight(terrain, p.x, p.z);
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
            if (!IsAware && (Kind == EnemyKind.Cover || Kind == EnemyKind.Tree) && state == State.Peeking)
                stateTimer = Mathf.Min(stateTimer, Random.Range(0.3f, 1f));
            IsAware = true;
        }

        public void Alert(float hideTime)
        {
            if (IsDead) return;
            SetAware();
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
            Health -= damage * (headshot ? 3f : 1f);
            staggerTimer = .18f;
            if (motion != null) motion.Hit(bulletDir);
            SetAware();
            if (Health <= 0f)
            {
                Kill(headshot, bulletDir);
                return true;
            }
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
            foreach (var c in GetComponentsInChildren<Collider>()) c.enabled = false;
            if (motion != null) motion.Die(bulletDir);
            else
            {
                if (animator != null) SetAnim("Dead", true);
                StartCoroutine(FallDown(bulletDir));
            }
            if (Kind == EnemyKind.Rusher) Destroy(gameObject, 25f);
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

        float StandardHitChance()
        {
            float dist = Vector3.Distance(transform.position, gm.PlayerEye.position);
            return 0.2f * Mathf.Clamp01(1.3f - dist / 700f);
        }

        float RusherHitChance()
        {
            float dist = Vector3.Distance(transform.position, gm.PlayerEye.position);
            return Mathf.Clamp(0.04f + 0.22f * (1f - dist / 160f), 0.03f, 0.26f);
        }

        void TryShoot(float hitChance, float minInterval = 1.6f, float maxInterval = 3.2f)
        {
            if (Time.time < nextShotTime) return;
            nextShotTime = Time.time + Random.Range(minInterval, maxInterval);
            if (cover > 0.7f) return;
            if (!HasLineOfSight()) return;
            FireAtPlayer(hitChance);
        }

        bool HasLineOfSight()
        {
            Vector3 from = head.position + transform.forward * (0.3f * scale);
            Vector3 to = gm.PlayerEye.position;
            return !Physics.Linecast(from, to, out _, ~0, QueryTriggerInteraction.Ignore);
        }

        void FireAtPlayer(float hitChance)
        {
            if (motion != null) motion.Fire();
            Vector3 muzzle = rifleTip.position;
            Vector3 eye = gm.PlayerEye.position;
            float dist = Vector3.Distance(muzzle, eye);
            bool hit = Random.value < hitChance;

            Vector3 target = hit ? eye : eye + Random.onUnitSphere * Random.Range(1f, 3.5f);
            Vector3 dir = (target - muzzle).normalized;
            Vector3 end = hit ? eye : target + dir * 25f;

            Effects.Tracer(muzzle, end, new Color(1f, 0.85f, 0.4f), 0.16f, Kind == EnemyKind.Rusher ? 0.12f : 0.25f);
            Effects.Flash(muzzle, new Color(1f, 0.8f, 0.5f), 4f, 6f, 0.06f);
            float damage = Kind == EnemyKind.Rusher ? Random.Range(7f, 13f) : Random.Range(18f, 26f);
            gm.StartCoroutine(gm.EnemyShotArrival(dist, hit, damage));
        }
    }
}
