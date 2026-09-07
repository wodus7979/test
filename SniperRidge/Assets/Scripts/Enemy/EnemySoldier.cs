using System.Collections;
using UnityEngine;

namespace SniperRidge
{
    public enum EnemyKind { Cover, Patrol }

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
    /// 적 병사. Cover 형은 바위 뒤에 숨었다가 주기적으로 고개를 내밀고,
    /// Patrol 형은 두 지점 사이를 오간다. 플레이어가 사격하면 경계 태세로 전환해 반격한다.
    /// </summary>
    public class EnemySoldier : MonoBehaviour
    {
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
        float crouch, crouchTarget = 1f;
        Vector3 walkTarget;
        Vector3 faceDir = Vector3.forward;
        float nextShotTime;

        // ---------- 생성 ----------

        public static EnemySoldier Create(string name, Terrain terrain, EnemySpawn spawn,
                                          Vector3 playerPos, Material body, Material skin, Material gear, Material rock)
        {
            Vector3 ground = TerrainGenerator.OnGround(terrain, spawn.Pos.x, spawn.Pos.y);

            var root = new GameObject(name);
            root.transform.position = ground;

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

            // 몸통
            var bodyGo = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            bodyGo.name = "Body";
            bodyGo.transform.SetParent(rigGo.transform, false);
            bodyGo.transform.localPosition = new Vector3(0f, 0.72f, 0f);
            bodyGo.transform.localScale = new Vector3(0.6f, 0.72f, 0.6f);
            bodyGo.GetComponent<Renderer>().material = body;
            var bodyHb = bodyGo.AddComponent<EnemyHitbox>();
            bodyHb.Owner = soldier;
            bodyHb.IsHead = false;

            // 머리
            var headGo = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            headGo.name = "Head";
            headGo.transform.SetParent(rigGo.transform, false);
            headGo.transform.localPosition = new Vector3(0f, 1.62f, 0f);
            headGo.transform.localScale = new Vector3(0.3f, 0.3f, 0.3f);
            headGo.GetComponent<Renderer>().material = skin;
            var headHb = headGo.AddComponent<EnemyHitbox>();
            headHb.Owner = soldier;
            headHb.IsHead = true;
            soldier.head = headGo.transform;

            // 헬멧
            var helmet = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            helmet.name = "Helmet";
            helmet.transform.SetParent(rigGo.transform, false);
            helmet.transform.localPosition = new Vector3(0f, 1.68f, 0f);
            helmet.transform.localScale = new Vector3(0.34f, 0.26f, 0.34f);
            helmet.GetComponent<Renderer>().material = gear;
            Destroy(helmet.GetComponent<Collider>());

            // 소총
            var rifle = GameObject.CreatePrimitive(PrimitiveType.Cube);
            rifle.name = "Rifle";
            rifle.transform.SetParent(rigGo.transform, false);
            rifle.transform.localPosition = new Vector3(0.22f, 1.25f, 0.45f);
            rifle.transform.localScale = new Vector3(0.06f, 0.06f, 0.9f);
            rifle.GetComponent<Renderer>().material = gear;
            Destroy(rifle.GetComponent<Collider>());
            var tip = new GameObject("Tip");
            tip.transform.SetParent(rifle.transform, false);
            tip.transform.localPosition = new Vector3(0f, 0f, 0.5f);
            soldier.rifleTip = tip.transform;

            soldier.renderers = rigGo.GetComponentsInChildren<Renderer>();

            // 엄폐용 바위 (플레이어 쪽에 배치)
            if (spawn.Kind == EnemyKind.Cover)
            {
                Vector3 toPlayer = playerPos - ground;
                toPlayer.y = 0f;
                toPlayer.Normalize();
                var rockGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
                rockGo.name = name + "_Cover";
                rockGo.transform.position = ground + toPlayer * 1.15f + Vector3.up * 0.2f;
                rockGo.transform.rotation = Quaternion.LookRotation(toPlayer);
                rockGo.transform.localScale = new Vector3(1.7f, 1.6f, 0.9f);
                rockGo.GetComponent<Renderer>().material = rock;
            }

            return soldier;
        }

        // ---------- 수명주기 ----------

        void Start()
        {
            gm = GameManager.Instance;
            if (Kind == EnemyKind.Cover)
            {
                state = State.Hidden;
                stateTimer = Random.Range(0.5f, 4f);
                crouch = 1f;
                crouchTarget = 1f;
            }
            else
            {
                state = State.Walking;
                walkTarget = PointB;
                crouch = 0f;
                crouchTarget = 0f;
            }
            FacePlayerInstant();
        }

        void Update()
        {
            if (IsDead || gm == null || !gm.IsPlaying) return;
            float dt = Time.deltaTime;

            crouch = Mathf.MoveTowards(crouch, crouchTarget, dt * 3f);
            rig.localScale = new Vector3(1f, 1f - 0.45f * crouch, 1f);

            switch (state)
            {
                case State.Hidden:
                    crouchTarget = 1f;
                    stateTimer -= dt;
                    if (stateTimer <= 0f)
                    {
                        state = State.Peeking;
                        stateTimer = IsAware ? Random.Range(1.5f, 3f) : Random.Range(2.5f, 5f);
                        nextShotTime = Time.time + Random.Range(0.6f, 1.2f);
                    }
                    break;

                case State.Peeking:
                    crouchTarget = 0f;
                    stateTimer -= dt;
                    if (IsAware) TryShoot();
                    if (stateTimer <= 0f)
                    {
                        state = State.Hidden;
                        stateTimer = IsAware ? Random.Range(4f, 9f) : Random.Range(2f, 5f);
                    }
                    break;

                case State.Walking:
                    {
                        crouchTarget = 0f;
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
                            Vector3 step = to.normalized * speed * dt;
                            Vector3 p = transform.position + step;
                            p.y = TerrainGenerator.GroundHeight(terrain, p.x, p.z);
                            transform.position = p;
                            faceDir = to.normalized;
                        }
                        break;
                    }

                case State.Waiting:
                    crouchTarget = 0f;
                    stateTimer -= dt;
                    if (IsAware) TryShoot();
                    if (stateTimer <= 0f)
                    {
                        walkTarget = (walkTarget == PointA) ? PointB : PointA;
                        state = State.Walking;
                    }
                    break;
            }

            // 방향: 걷는 중이면 진행 방향, 아니면 플레이어 쪽
            if (state != State.Walking)
            {
                Vector3 d = gm.PlayerEye.position - transform.position;
                d.y = 0f;
                if (d.sqrMagnitude > 0.01f) faceDir = d.normalized;
            }
            transform.rotation = Quaternion.RotateTowards(transform.rotation, Quaternion.LookRotation(faceDir), 360f * dt);
        }

        void FacePlayerInstant()
        {
            if (gm == null || gm.PlayerEye == null) return;
            Vector3 d = gm.PlayerEye.position - transform.position;
            d.y = 0f;
            if (d.sqrMagnitude > 0.01f)
            {
                faceDir = d.normalized;
                transform.rotation = Quaternion.LookRotation(faceDir);
            }
        }

        // ---------- 반응 ----------

        /// <summary>총성을 들음: 경계 태세로 전환.</summary>
        public void SetAware()
        {
            if (IsDead) return;
            if (!IsAware && Kind == EnemyKind.Cover && state == State.Peeking)
                stateTimer = Mathf.Min(stateTimer, Random.Range(0.3f, 1f));
            IsAware = true;
        }

        /// <summary>근처에 탄이 스침/착탄: 즉시 숨거나 뛴다.</summary>
        public void Alert(float hideTime)
        {
            if (IsDead) return;
            SetAware();
            if (Kind == EnemyKind.Cover)
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
            if (crouch > 0.3f) return;
            if (!HasLineOfSight()) return;
            FireAtPlayer();
        }

        bool HasLineOfSight()
        {
            Vector3 from = head.position + transform.forward * 0.25f;
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
