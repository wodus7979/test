using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace SniperRidge
{
    /// <summary>
    /// 씬이 로드되면 지형, 플레이어, 적, 장식, UI를 전부 코드로 생성한다.
    /// 씬 파일에는 아무것도 배치할 필요가 없다.
    /// </summary>
    public static class LevelBuilder
    {
        const float Seed = 2.59f;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            SceneManager.sceneLoaded -= OnSceneLoaded;
            SceneManager.sceneLoaded += OnSceneLoaded;
            Build();
        }

        static void OnSceneLoaded(Scene scene, LoadSceneMode mode) => Build();

        /// <summary>현재 씬의 오브젝트를 모두 지운 뒤 다음 프레임에 다시 만든다.</summary>
        public static void ScheduleRebuild()
        {
            var go = new GameObject("Rebuilder");
            go.AddComponent<Rebuilder>();
        }

        class Rebuilder : MonoBehaviour
        {
            void Start()
            {
                Build();
                Destroy(gameObject);
            }
        }

        public static void Build()
        {
            if (Object.FindObjectOfType<GameManager>() != null) return;

            Random.InitState(System.Environment.TickCount);
            Application.targetFrameRate = 60;
            if (Application.isMobilePlatform) Screen.sleepTimeout = SleepTimeout.NeverSleep;

            // 기본 씬에 들어 있는 카메라/조명 제거 (우리가 직접 만든다)
            foreach (var c in Object.FindObjectsOfType<Camera>()) Object.Destroy(c.gameObject);
            foreach (var l in Object.FindObjectsOfType<Light>()) Object.Destroy(l.gameObject);
            foreach (var e in Object.FindObjectsOfType<EventSystem>()) Object.Destroy(e.gameObject);

            var gmGo = new GameObject("GameManager");
            var gm = gmGo.AddComponent<GameManager>();
            gm.Wind = gmGo.AddComponent<WindSystem>();

            SetupLighting();

            var terrain = TerrainGenerator.Build(Seed);
            gm.Terrain = terrain;

            Vector3 nest = TerrainGenerator.OnGround(terrain, 0f, TerrainGenerator.PlayerRidgeZ);
            BuildPlayer(gm, nest);

            var spawns = EnemySpawns();
            BuildDecorations(terrain, nest, spawns);

            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            gm.Hud = HudController.Build(gm);
            if (Application.isMobilePlatform) TouchControls.Build(gm);
            // 적은 무기 선택 후 GameManager.StartMission 에서 생성된다.
        }

        // ---------- 조명 / 환경 ----------

        static void SetupLighting()
        {
            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.95f, 0.85f);
            sun.intensity = 1.15f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.8f;
            sunGo.transform.rotation = Quaternion.Euler(48f, -35f, 0f);
            RenderSettings.sun = sun;

            RenderSettings.ambientIntensity = 1.1f;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 120f;
            RenderSettings.fogEndDistance = 1300f;
            RenderSettings.fogColor = new Color(0.70f, 0.77f, 0.86f);

            QualitySettings.shadowDistance = 90f;
        }

        // ---------- 플레이어 ----------

        static void BuildPlayer(GameManager gm, Vector3 nest)
        {
            var player = new GameObject("Player");
            player.transform.position = nest;
            player.transform.rotation = Quaternion.identity; // +Z (적 능선 방향)

            var eyeGo = new GameObject("Eye");
            eyeGo.transform.SetParent(player.transform, false);
            eyeGo.transform.localPosition = new Vector3(0f, 1.1f, 0f);
            eyeGo.tag = "MainCamera";
            var cam = eyeGo.AddComponent<Camera>();
            cam.fieldOfView = 60f;
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 3000f;
            eyeGo.AddComponent<AudioListener>();

            var muzzleGo = new GameObject("MuzzleFlash");
            muzzleGo.transform.SetParent(eyeGo.transform, false);
            muzzleGo.transform.localPosition = new Vector3(0.28f, -0.18f, 1.2f);
            var muzzle = muzzleGo.AddComponent<Light>();
            muzzle.type = LightType.Point;
            muzzle.color = new Color(1f, 0.85f, 0.6f);
            muzzle.intensity = 5f;
            muzzle.range = 8f;
            muzzle.enabled = false;

            var ctrl = player.AddComponent<SniperController>();
            ctrl.Init(cam, muzzle);
            var health = player.AddComponent<PlayerHealth>();

            gm.Player = ctrl;
            gm.PlayerEye = eyeGo.transform;
            gm.Health = health;

            // 모래주머니 엄폐물 (눈높이보다 낮게)
            var sandbag = ProceduralAssets.LitMaterial(new Color(0.55f, 0.48f, 0.32f), 0.05f);
            for (int row = 0; row < 2; row++)
            {
                for (int i = -1; i <= 1; i++)
                {
                    float y = row == 0 ? 0.2f : 0.55f;
                    float xOff = i * 0.78f + (row == 1 ? 0.39f : 0f);
                    var bag = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    bag.name = "Sandbag";
                    bag.transform.position = nest + new Vector3(xOff, y, 1.15f);
                    bag.transform.localScale = new Vector3(0.75f, 0.5f, 0.45f);
                    bag.GetComponent<Renderer>().material = sandbag;
                }
            }

            // 잠복용 덤불
            var bushRng = new System.Random(5);
            Vector3[] bushOffsets = { new Vector3(-1.9f, 0f, 0.6f), new Vector3(2.0f, 0f, 0.4f), new Vector3(-1.4f, 0f, -1.4f), new Vector3(1.5f, 0f, -1.2f) };
            foreach (var off in bushOffsets)
                Vegetation.Bush(null, nest + off, 0.9f, bushRng);
        }

        // ---------- 적 ----------

        static List<EnemySpawn> EnemySpawns()
        {
            return new List<EnemySpawn>
            {
                new EnemySpawn(-88f, 214f, EnemyKind.Cover),
                new EnemySpawn(-62f, 202f, EnemyKind.Tree),
                new EnemySpawn(-40f, 220f, EnemyKind.Cover),
                new EnemySpawn(-20f, 206f, EnemyKind.Patrol, -4f, 212f),
                new EnemySpawn(-2f, 226f, EnemyKind.Tree),
                new EnemySpawn(24f, 212f, EnemyKind.Cover),
                new EnemySpawn(44f, 222f, EnemyKind.Tree),
                new EnemySpawn(58f, 204f, EnemyKind.Patrol, 74f, 212f),
                new EnemySpawn(80f, 224f, EnemyKind.Cover),
                new EnemySpawn(96f, 208f, EnemyKind.Tree),
            };
        }

        static Material enemyBody, enemySkin, enemyGear, enemyRock;

        static void EnsureEnemyMaterials()
        {
            if (enemyBody != null) return;
            enemyBody = ProceduralAssets.LitMaterial(new Color(0.44f, 0.42f, 0.28f), 0.05f);
            enemySkin = ProceduralAssets.LitMaterial(new Color(0.78f, 0.62f, 0.48f), 0.1f);
            enemyGear = ProceduralAssets.LitMaterial(new Color(0.12f, 0.13f, 0.11f), 0.2f);
            enemyRock = ProceduralAssets.LitMaterial(new Color(0.50f, 0.49f, 0.46f), 0.05f);
        }

        static Transform EnemyRoot()
        {
            var existing = GameObject.Find("Enemies");
            return (existing != null ? existing : new GameObject("Enemies")).transform;
        }

        /// <summary>저격 임무: 맞은편 능선에 엄폐/순찰 적 배치.</summary>
        public static void SpawnSniperEnemies(GameManager gm)
        {
            EnsureEnemyMaterials();
            var rng = new System.Random(77);
            var root = EnemyRoot();
            var spawns = EnemySpawns();
            Vector3 playerPos = gm.PlayerEye.position;
            for (int i = 0; i < spawns.Count; i++)
            {
                var e = EnemySoldier.Create("Enemy_" + (i + 1), gm.Terrain, spawns[i], playerPos, EnemySoldier.SniperModeScale,
                                            enemyBody, enemySkin, enemyGear, enemyRock, rng);
                e.transform.SetParent(root, true);
                gm.RegisterEnemy(e);
            }
        }

        /// <summary>방어전: 지정 위치에 돌격형 적 하나 생성.</summary>
        public static EnemySoldier SpawnRusher(GameManager gm, Vector2 xz, string name)
        {
            EnsureEnemyMaterials();
            var rng = new System.Random(name.GetHashCode());
            var spawn = new EnemySpawn(xz.x, xz.y, EnemyKind.Rusher);
            var e = EnemySoldier.Create(name, gm.Terrain, spawn, gm.PlayerEye.position, EnemySoldier.DefenseModeScale,
                                        enemyBody, enemySkin, enemyGear, enemyRock, rng);
            e.transform.SetParent(EnemyRoot(), true);
            gm.RegisterEnemy(e);
            return e;
        }

        // ---------- 장식 (숲, 덤불, 바위) ----------

        static void BuildDecorations(Terrain terrain, Vector3 playerPos, List<EnemySpawn> spawns)
        {
            var rng = new System.Random(1234);
            var root = new GameObject("Decorations");
            var rockMat = ProceduralAssets.LitMaterial(new Color(0.48f, 0.47f, 0.44f), 0.05f);

            var enemyXZ = new List<Vector2>();
            patrolRoutes.Clear();
            foreach (var sp in spawns)
            {
                enemyXZ.Add(sp.Pos);
                if (sp.Kind == EnemyKind.Patrol)
                {
                    enemyXZ.Add(sp.PosB);
                    enemyXZ.Add((sp.Pos + sp.PosB) * 0.5f);
                    patrolRoutes.Add(new Vector4(sp.Pos.x, sp.Pos.y, sp.PosB.x, sp.PosB.y));
                }
            }
            Vector2 playerXZ = new Vector2(playerPos.x, playerPos.z);

            int placed = 0;

            // (1) 적 능선 뒤편: 빽빽한 침엽수림 (배경)
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, -280f, 280f, 238f, 285f, 260, 0.9f, 0.85f);
            // (2) 적 능선 사면 좌우: 숲 가장자리
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, -280f, -115f, 150f, 240f, 90, 0.7f, 0.8f);
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, 115f, 280f, 150f, 240f, 90, 0.7f, 0.8f);
            // (3) 적 사면 한가운데: 듬성듬성한 나무 군락 (적이 이 사이에 숨어 있다)
            float[] groveX = { -75f, -30f, 12f, 52f, 92f };
            foreach (float gx in groveX)
                placed += Grove(root.transform, terrain, rng, playerXZ, enemyXZ, gx, 232f, 16f, 9);
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, -110f, 110f, 160f, 236f, 45, 0.3f, 0.75f);
            // (4) 계곡: 흩어진 활엽수 군락과 덤불
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, -280f, 280f, -60f, 130f, 110, 0.15f, 0.6f);
            // (5) 플레이어 능선 뒤편과 좌우
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, -280f, 280f, -300f, TerrainGenerator.PlayerRidgeZ - 20f, 120, 0.8f, 0.7f);
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, -280f, -160f, TerrainGenerator.PlayerRidgeZ - 20f, 60f, 50, 0.6f, 0.7f);
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, 160f, 280f, TerrainGenerator.PlayerRidgeZ - 20f, 60f, 50, 0.6f, 0.7f);

            // 덤불
            for (int i = 0; i < 160; i++)
            {
                float x = (float)(rng.NextDouble() * 560.0 - 280.0);
                float z = (float)(rng.NextDouble() * 560.0 - 280.0);
                if (Vector2.Distance(new Vector2(x, z), playerXZ) < 4f) continue;
                if (NearEnemy(new Vector2(x, z), enemyXZ, 4f)) continue;
                float h = TerrainGenerator.GroundHeight(terrain, x, z);
                if (h > 95f) continue;
                Vegetation.Bush(root.transform, new Vector3(x, h, z), 0.7f + (float)rng.NextDouble() * 0.8f, rng);
            }

            // 바위 (나무와 같은 규칙으로 사선을 가리지 않는 곳에만)
            for (int i = 0; i < 80; i++)
            {
                float x = (float)(rng.NextDouble() * 560.0 - 280.0);
                float z = (float)(rng.NextDouble() * 560.0 - 280.0);
                if (!TreeAllowed(x, z, playerXZ, enemyXZ)) continue;
                var r = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                r.name = "Rock";
                r.transform.SetParent(root.transform, true);
                float sc = 0.8f + (float)rng.NextDouble() * 2.4f;
                r.transform.position = new Vector3(x, TerrainGenerator.GroundHeight(terrain, x, z) + sc * 0.2f, z);
                r.transform.localScale = new Vector3(sc, sc * 0.55f, sc * 0.8f);
                r.transform.rotation = Quaternion.Euler((float)rng.NextDouble() * 20f, (float)rng.NextDouble() * 360f, 0f);
                r.GetComponent<Renderer>().material = rockMat;
            }

            StaticBatchingUtility.Combine(root);
        }

        /// <summary>사각 영역에 나무를 뿌린다. pineRatio 는 침엽수 비율.</summary>
        static int Forest(Transform parent, Terrain terrain, System.Random rng, Vector2 player, List<Vector2> enemies,
                          float x0, float x1, float z0, float z1, int count, float pineRatio, float minScale)
        {
            int placed = 0, attempts = 0;
            while (placed < count && attempts < count * 12)
            {
                attempts++;
                float x = (float)(x0 + rng.NextDouble() * (x1 - x0));
                float z = (float)(z0 + rng.NextDouble() * (z1 - z0));
                if (!TreeAllowed(x, z, player, enemies)) continue;
                float h = TerrainGenerator.GroundHeight(terrain, x, z);
                if (h > 100f) continue;
                float scale = minScale + (float)rng.NextDouble() * 0.7f;
                var type = rng.NextDouble() < pineRatio ? Vegetation.TreeType.Pine : Vegetation.TreeType.Broadleaf;
                Vegetation.Tree(parent, new Vector3(x, h, z), scale, type, rng);
                placed++;
            }
            return placed;
        }

        /// <summary>원형 군락.</summary>
        static int Grove(Transform parent, Terrain terrain, System.Random rng, Vector2 player, List<Vector2> enemies,
                         float cx, float cz, float radius, int count)
        {
            int placed = 0, attempts = 0;
            while (placed < count && attempts < count * 12)
            {
                attempts++;
                float ang = (float)(rng.NextDouble() * Mathf.PI * 2.0);
                float rad = radius * Mathf.Sqrt((float)rng.NextDouble());
                float x = cx + Mathf.Cos(ang) * rad;
                float z = cz + Mathf.Sin(ang) * rad;
                if (!TreeAllowed(x, z, player, enemies)) continue;
                float h = TerrainGenerator.GroundHeight(terrain, x, z);
                float scale = 0.8f + (float)rng.NextDouble() * 0.6f;
                var type = rng.NextDouble() < 0.5 ? Vegetation.TreeType.Pine : Vegetation.TreeType.Broadleaf;
                Vegetation.Tree(parent, new Vector3(x, h, z), scale, type, rng);
                placed++;
            }
            return placed;
        }

        static readonly List<Vector4> patrolRoutes = new List<Vector4>();

        static bool NearEnemy(Vector2 p, List<Vector2> enemies, float dist)
        {
            foreach (var e in enemies) if (Vector2.Distance(p, e) < dist) return true;
            return false;
        }

        static bool TreeAllowed(float x, float z, Vector2 player, List<Vector2> enemies)
        {
            var p = new Vector2(x, z);
            float ridge = TerrainGenerator.PlayerRidgeZ;
            if (Vector2.Distance(p, player) < 30f) return false;
            // 플레이어 앞쪽 사면: 시야 확보를 위해 비워 둔다
            if (z > ridge - 5f && z < ridge + 90f && Mathf.Abs(x) < 150f) return false;
            if (NearEnemy(p, enemies, 7f)) return false;
            // 순찰 경로 위에는 놓지 않는다
            foreach (var r in patrolRoutes)
            {
                if (DistancePointSegment(p, new Vector2(r.x, r.y), new Vector2(r.z, r.w)) < 5f) return false;
            }
            // 적 사면/플레이어 사면에서는 사선(射線)을 가리는 위치를 피한다
            if (z > 100f || z < ridge + 80f)
            {
                foreach (var e in enemies)
                {
                    if (DistancePointSegment(p, player, e) < 6f) return false;
                }
            }
            return true;
        }

        static float DistancePointSegment(Vector2 p, Vector2 a, Vector2 b)
        {
            Vector2 ab = b - a;
            float len2 = ab.sqrMagnitude;
            if (len2 < 0.0001f) return Vector2.Distance(p, a);
            float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / len2);
            return Vector2.Distance(p, a + ab * t);
        }
    }
}
