using System.Collections;
using UnityEngine;

namespace SniperRidge
{
    public enum EnemyKind { Cover, Patrol, Tree }

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
    /// 플레이어가 사격하면 경계 태세로 전환해 노출 시간을 줄이고 반격한다.
    /// </summary>
    public class EnemySoldier : MonoBehaviour
    {
        /// <summary>적 전체 크기 배율 (조준 난이도 조절용).</summary>
        public const float Scale = 1.5f;
        const float CrouchFactor = 0.5f;     // 웅크렸을 때 키 비율
        const float PeekSlide = 0.85f;       // 나무 옆으로 내미는 거리 (로컬 단위)

        public EnemyKind Kind;
        public Vector3 PointA, PointB;

        public bool IsDead { get; private set; }
        public bool IsAware { get; private set; }
        public Transform Head => head;

        enum State { Hidden, Peeking, Walking, Waiting }

        Transform rig, head, rifleTip;
        Renderer[] renderers;
        Terrain terrain;
        GameManager gm;

        State state;
        float stateTimer;
        float cover, coverTarget = 1f;   // 1 = 완전히 숨음, 0 = 완전히 노출
        int peekSide = 1;                // Tree: 어느 쪽으로 내밀지
        Vector3 walkTarget;
        Vector3 faceDir = Vector3.forward;
        float nextShotTime;

        // ---------- 생성 ----------

        public static EnemySoldier Create(string name, Terrain terrain, EnemySpawn spawn, Vector3 playerPos,
                                          Material body, Material skin, Material gear, Material rock, System.Random rng)
        {
            Vector3 ground = TerrainGenerator.OnGround(terrain, spawn.Pos.x, spawn.Pos.y);
            Vector3 toPlayer = playerPos - ground;
            toPlayer.y = 0f;
            toPlayer.Normalize();

            var root = new GameObject(name);
            root.transform.position = ground;
            root.transform.rotation = Quaternion.LookRotation(toPlayer);
            root.transform.localScale = Vector3.one * Scale;

            var rigGo = new GameObject("Rig");
            rigGo.transform.SetParent(root.transform, false);

            var soldier = root.AddComponent<EnemySoldier>();
            soldier.Kind = spawn.Kind;
            soldier.terrain = terrain;
            soldier.rig = rigGo.transform;
            soldier.PointA = ground;
            soldier.PointB = spawn.Kind == EnemyKind.Patrol
                ? TerrainGenerator.OnGround(terrain, spawn.PosB.x, spawn.PosB.y)
                : ground;
            soldier.peekSide = rng.NextDouble() < 0.5 ? -1 : 1;
            soldier.faceDir = toPlayer;

            BuildModel(soldier, rigGo.transform, body, skin, gear);

            // 엄폐물
            if (spawn.Kind == EnemyKind.Cover)
            {
                var rockGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
                rockGo.name = name + "_Cover";
                rockGo.transform.position = ground + toPlayer * (1.15f * Scale) + Vector3.up * (0.25f * Scale);
                rockGo.transform.rotation = Quaternion.LookRotation(toPlayer) * Quaternion.Euler(0f, (float)(rng.NextDouble() * 10.0 - 5.0), 0f);
                rockGo.transform.localScale = new Vector3(1.9f, 1.7f, 0.9f) * Scale;
                rockGo.GetComponent<Renderer>().material = rock;
                // 작은 돌 몇 개
                for (int i = 0; i < 3; i++)
                {
                    var pebble = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    pebble.name = "Pebble";
                    Vector3 side = Vector3.Cross(Vector3.up, toPlayer);
                    pebble.transform.position = rockGo.transform.position + side * (float)((rng.NextDouble() - 0.5) * 3.0 * Scale) + toPlayer * 0.6f;
                    pebble.transform.position = new Vector3(pebble.transform.position.x,
                        TerrainGenerator.GroundHeight(terrain, pebble.transform.position.x, pebble.transform.position.z) + 0.1f, pebble.transform.position.z);
                    float ps = (float)(0.4 + rng.NextDouble() * 0.6) * Scale;
                    pebble.transform.localScale = new Vector3(ps, ps * 0.6f, ps * 0.8f);
                    pebble.GetComponent<Renderer>().material = rock;
                }
            }
            else if (spawn.Kind == EnemyKind.Tree)
            {
                // 플레이어 쪽에 굵은 나무. 몸통 지름은 병사 몸 폭보다 넉넉히 크게.
                float trunkDiameter = 0.95f * Scale;
                Vector3 treePos = ground + toPlayer * (1.05f * Scale);
                treePos.y = TerrainGenerator.GroundHeight(terrain, treePos.x, treePos.z) - 0.3f;
                Vegetation.CoverTree(null, treePos, trunkDiameter, 1.1f);
            }

            return soldier;
        }

        /// <summary>다리, 몸통, 머리, 헬멧, 배낭, 소총으로 구성된 병사 모델.</summary>
        static void BuildModel(EnemySoldier soldier, Transform rig, Material body, Material skin, Material gear)
        {
            // 다리 두 개 (몸통 히트박스)
            for (int i = -1; i <= 1; i += 2)
            {
                var leg = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                leg.name = "Leg";
                leg.transform.SetParent(rig, false);
                leg.transform.localPosition = new Vector3(0.13f * i, 0.42f, 0f);
                leg.transform.localScale = new Vector3(0.24f, 0.42f, 0.24f);
                leg.GetComponent<Renderer>().material = body;
                var hb = leg.AddComponent<EnemyHitbox>();
                hb.Owner = soldier;
                hb.IsHead = false;
            }

            // 몸통
            var torso = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            torso.name = "Torso";
            torso.transform.SetParent(rig, false);
            torso.transform.localPosition = new Vector3(0f, 1.15f, 0f);
            torso.transform.localScale = new Vector3(0.56f, 0.42f, 0.4f);
            torso.GetComponent<Renderer>().material = body;
            var torsoHb = torso.AddComponent<EnemyHitbox>();
            torsoHb.Owner = soldier;
            torsoHb.IsHead = false;

            // 배낭
            var pack = GameObject.CreatePrimitive(PrimitiveType.Cube);
            pack.name = "Backpack";
            pack.transform.SetParent(rig, false);
            pack.transform.localPosition = new Vector3(0f, 1.2f, -0.27f);
            pack.transform.localScale = new Vector3(0.38f, 0.42f, 0.2f);
            pack.GetComponent<Renderer>().material = gear;
            Destroy(pack.GetComponent<Collider>());

            // 팔 (소총을 든 자세)
            var armL = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            armL.name = "ArmL";
            armL.transform.SetParent(rig, false);
            armL.transform.localPosition = new Vector3(-0.12f, 1.28f, 0.28f);
            armL.transform.localRotation = Quaternion.Euler(80f, 0f, 20f);
            armL.transform.localScale = new Vector3(0.14f, 0.26f, 0.14f);
            armL.GetComponent<Renderer>().material = body;
            Destroy(armL.GetComponent<Collider>());
            var armR = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            armR.name = "ArmR";
            armR.transform.SetParent(rig, false);
            armR.transform.localPosition = new Vector3(0.24f, 1.22f, 0.18f);
            armR.transform.localRotation = Quaternion.Euler(70f, 0f, -25f);
            armR.transform.localScale = new Vector3(0.14f, 0.24f, 0.14f);
            armR.GetComponent<Renderer>().material = body;
            Destroy(armR.GetComponent<Collider>());

            // 머리 (헤드샷 히트박스)
            var headGo = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            headGo.name = "Head";
            headGo.transform.SetParent(rig, false);
            headGo.transform.localPosition = new Vector3(0f, 1.72f, 0f);
            headGo.transform.localScale = new Vector3(0.3f, 0.3f, 0.3f);
            headGo.GetComponent<Renderer>().material = skin;
            var headHb = headGo.AddComponent<EnemyHitbox>();
            headHb.Owner = soldier;
            headHb.IsHead = true;
            soldier.head = headGo.transform;

            // 헬멧
            var helmet = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            helmet.name = "Helmet";
            helmet.transform.SetParent(rig, false);
            helmet.transform.localPosition = new Vector3(0f, 1.79f, -0.01f);
            helmet.transform.localScale = new Vector3(0.36f, 0.27f, 0.37f);
            helmet.GetComponent<Renderer>().material = gear;
            Destroy(helmet.GetComponent<Collider>());

            // 소총 (총열 + 몸체 + 탄창)
            var rifle = GameObject.CreatePrimitive(PrimitiveType.Cube);
            rifle.name = "Rifle";
            rifle.transform.SetParent(rig, false);
            rifle.transform.localPosition = new Vector3(0.1f, 1.32f, 0.25f);
            rifle.transform.localScale = new Vector3(0.06f, 0.08f, 0.7f);
            rifle.GetComponent<Renderer>().material = gear;
            Destroy(rifle.GetComponent<Collider>());
            var mag = GameObject.CreatePrimitive(PrimitiveType.Cube);
            mag.name = "Magazine";
            mag.transform.SetParent(rifle.transform, false);
            mag.transform.localPosition = new Vector3(0f, -1.1f, 0.05f);
            mag.transform.localScale = new Vector3(0.8f, 1.6f, 0.12f);
            mag.GetComponent<Renderer>().material = gear;
            Destroy(mag.GetComponent<Collider>());
            var tip = new GameObject("Tip");
            tip.transform.SetParent(rifle.transform, false);
            tip.transform.localPosition = new Vector3(0f, 0f, 0.5f);
            soldier.rifleTip = tip.transform;

            soldier.renderers = rig.GetComponentsInChildren<Renderer>();
        }

        // ---------- 수명주기 ----------

        void Start()
        {
            gm = GameManager.Instance;
            if (Kind == EnemyKind.Patrol)
            {
                state = State.Walking;
                walkTarget = PointB;
                cover = 0f;
                coverTarget = 0f;
            }
            else
            {
                state = State.Hidden;
                stateTimer = Random.Range(0.5f, 4f);
                cover = 1f;
                coverTarget = 1f;
            }
            ApplyCover();
        }

        void Update()
        {
            if (IsDead || gm == null || !gm.IsPlaying) return;
            float dt = Time.deltaTime;

            cover = Mathf.MoveTowards(cover, coverTarget, dt * 2.5f);
            ApplyCover();

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
                    if (IsAware) TryShoot();
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
                            Vector3 p = transform.position + to.normalized * speed * dt;
                            p.y = TerrainGenerator.GroundHeight(terrain, p.x, p.z);
                            transform.position = p;
                            faceDir = to.normalized;
                        }
                        break;
                    }

                case State.Waiting:
                    coverTarget = 0f;
                    stateTimer -= dt;
                    if (IsAware) TryShoot();
                    if (stateTimer <= 0f)
                    {
                        walkTarget = (walkTarget == PointA) ? PointB : PointA;
                        state = State.Walking;
                    }
                    break;
            }

            if (state != State.Walking)
            {
                Vector3 d = gm.PlayerEye.position - transform.position;
                d.y = 0f;
                if (d.sqrMagnitude > 0.01f) faceDir = d.normalized;
            }
            transform.rotation = Quaternion.RotateTowards(transform.rotation, Quaternion.LookRotation(faceDir), 360f * dt);
        }

        /// <summary>엄폐 정도(cover)를 모델에 적용: Cover/Patrol 은 웅크리기, Tree 는 옆으로 숨기.</summary>
        void ApplyCover()
        {
            if (Kind == EnemyKind.Tree)
            {
                rig.localScale = Vector3.one;
                rig.localPosition = new Vector3(peekSide * PeekSlide * (1f - cover), 0f, 0f);
            }
            else
            {
                rig.localPosition = Vector3.zero;
                rig.localScale = new Vector3(1f, 1f - (1f - CrouchFactor) * cover, 1f);
            }
        }

        // ---------- 반응 ----------

        public void SetAware()
        {
            if (IsDead) return;
            if (!IsAware && Kind != EnemyKind.Patrol && state == State.Peeking)
                stateTimer = Mathf.Min(stateTimer, Random.Range(0.3f, 1f));
            IsAware = true;
        }

        public void Alert(float hideTime)
        {
            if (IsDead) return;
            SetAware();
            if (Kind != EnemyKind.Patrol)
            {
                state = State.Hidden;
                stateTimer = Mathf.Max(stateTimer, hideTime);
            }
            else if (state == State.Waiting)
            {
                stateTimer = 0f;
            }
        }

        public void Kill(bool headshot, Vector3 bulletDir)
        {
            if (IsDead) return;
            IsDead = true;
            foreach (var r in renderers)
            {
                var m = r.material;
                m.color = m.color * 0.6f;
            }
            StartCoroutine(FallDown(bulletDir));
        }

        IEnumerator FallDown(Vector3 bulletDir)
        {
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

        void TryShoot()
        {
            if (Time.time < nextShotTime) return;
            nextShotTime = Time.time + Random.Range(1.6f, 3.2f);
            if (cover > 0.3f) return;
            if (!HasLineOfSight()) return;
            FireAtPlayer();
        }

        bool HasLineOfSight()
        {
            Vector3 from = head.position + transform.forward * (0.3f * Scale);
            Vector3 to = gm.PlayerEye.position;
            return !Physics.Linecast(from, to, out _, ~0, QueryTriggerInteraction.Ignore);
        }

        void FireAtPlayer()
        {
            Vector3 muzzle = rifleTip.position;
            Vector3 eye = gm.PlayerEye.position;
            float dist = Vector3.Distance(muzzle, eye);

            float hitChance = 0.2f * Mathf.Clamp01(1.3f - dist / 700f);
            bool hit = Random.value < hitChance;

            Vector3 target = hit ? eye : eye + Random.onUnitSphere * Random.Range(1f, 3.5f);
            Vector3 dir = (target - muzzle).normalized;
            Vector3 end = hit ? eye : target + dir * 25f;

            Effects.Tracer(muzzle, end, new Color(1f, 0.85f, 0.4f), 0.16f, 0.25f);
            Effects.Flash(muzzle, new Color(1f, 0.8f, 0.5f), 4f, 6f, 0.06f);
            gm.StartCoroutine(gm.EnemyShotArrival(dist, hit));
        }
    }
}
