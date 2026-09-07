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
            BuildEnemies(gm, terrain, spawns, nest);
            BuildDecorations(terrain, nest, spawns);

            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            gm.Hud = HudController.Build(gm);
            if (Application.isMobilePlatform) TouchControls.Build(gm);

            gm.BeginMission();
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

            // 1인칭 소총 모델
            var rifle = new GameObject("RifleModel");
            rifle.transform.SetParent(eyeGo.transform, false);
            rifle.transform.localPosition = new Vector3(0.28f, -0.22f, 0.45f);
            var black = ProceduralAssets.LitMaterial(new Color(0.08f, 0.08f, 0.09f), 0.45f);
            var wood = ProceduralAssets.LitMaterial(new Color(0.30f, 0.20f, 0.12f), 0.3f);
            Part(rifle.transform, PrimitiveType.Cube, new Vector3(0f, 0f, 0f), new Vector3(0.06f, 0.09f, 0.8f), Quaternion.identity, wood);
            Part(rifle.transform, PrimitiveType.Cylinder, new Vector3(0f, 0.02f, 0.75f), new Vector3(0.025f, 0.35f, 0.025f), Quaternion.Euler(90f, 0f, 0f), black);
            Part(rifle.transform, PrimitiveType.Cylinder, new Vector3(0f, 0.09f, 0.1f), new Vector3(0.045f, 0.13f, 0.045f), Quaternion.Euler(90f, 0f, 0f), black);
            Part(rifle.transform, PrimitiveType.Cube, new Vector3(0f, -0.04f, -0.45f), new Vector3(0.05f, 0.11f, 0.3f), Quaternion.identity, wood);

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
            ctrl.Init(cam, rifle, muzzle);
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
            var bush = ProceduralAssets.LitMaterial(new Color(0.14f, 0.28f, 0.10f), 0.05f);
            Vector3[] bushOffsets = { new Vector3(-1.6f, 0f, 0.6f), new Vector3(1.7f, 0f, 0.4f), new Vector3(-1.2f, 0f, -1.2f), new Vector3(1.3f, 0f, -1.0f) };
            foreach (var off in bushOffsets)
            {
                var b = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                b.name = "Bush";
                b.transform.position = nest + off + Vector3.up * 0.5f;
                b.transform.localScale = new Vector3(1.6f, 1.1f, 1.6f);
                b.GetComponent<Renderer>().material = bush;
            }
        }

        static void Part(Transform parent, PrimitiveType type, Vector3 pos, Vector3 scale, Quaternion rot, Material mat)
        {
            var go = GameObject.CreatePrimitive(type);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            go.transform.localRotation = rot;
            go.GetComponent<Renderer>().material = mat;
            go.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
            Object.Destroy(go.GetComponent<Collider>());
        }

        // ---------- 적 ----------

        static List<EnemySpawn> EnemySpawns()
        {
            return new List<EnemySpawn>
            {
                new EnemySpawn(-55f, 205f, EnemyKind.Cover),
                new EnemySpawn(-30f, 215f, EnemyKind.Cover),
                new EnemySpawn(-8f, 200f, EnemyKind.Patrol, 12f, 208f),
                new EnemySpawn(15f, 222f, EnemyKind.Cover),
                new EnemySpawn(38f, 212f, EnemyKind.Cover),
                new EnemySpawn(60f, 205f, EnemyKind.Patrol, 78f, 214f),
                new EnemySpawn(-72f, 224f, EnemyKind.Patrol, -52f, 230f),
                new EnemySpawn(88f, 220f, EnemyKind.Cover),
            };
        }

        static void BuildEnemies(GameManager gm, Terrain terrain, List<EnemySpawn> spawns, Vector3 playerPos)
        {
            var body = ProceduralAssets.LitMaterial(new Color(0.44f, 0.42f, 0.28f), 0.05f);
            var skin = ProceduralAssets.LitMaterial(new Color(0.78f, 0.62f, 0.48f), 0.1f);
            var gear = ProceduralAssets.LitMaterial(new Color(0.12f, 0.13f, 0.11f), 0.2f);
            var rock = ProceduralAssets.LitMaterial(new Color(0.50f, 0.49f, 0.46f), 0.05f);

            var root = new GameObject("Enemies");
            for (int i = 0; i < spawns.Count; i++)
            {
                var e = EnemySoldier.Create("Enemy_" + (i + 1), terrain, spawns[i], playerPos, body, skin, gear, rock);
                e.transform.SetParent(root.transform, true);
                gm.RegisterEnemy(e);
            }
        }

        // ---------- 장식 (나무, 바위) ----------

        static void BuildDecorations(Terrain terrain, Vector3 playerPos, List<EnemySpawn> spawns)
        {
            var rng = new System.Random(1234);
            var root = new GameObject("Decorations");
            var trunk = ProceduralAssets.LitMaterial(new Color(0.30f, 0.22f, 0.14f), 0.05f);
            var leafA = ProceduralAssets.LitMaterial(new Color(0.12f, 0.30f, 0.10f), 0.05f);
            var leafB = ProceduralAssets.LitMaterial(new Color(0.18f, 0.36f, 0.13f), 0.05f);
            var rockMat = ProceduralAssets.LitMaterial(new Color(0.48f, 0.47f, 0.44f), 0.05f);

            var enemyXZ = new List<Vector2>();
            foreach (var s in spawns)
            {
                enemyXZ.Add(s.Pos);
                if (s.Kind == EnemyKind.Patrol) enemyXZ.Add(s.PosB);
            }
            Vector2 playerXZ = new Vector2(playerPos.x, playerPos.z);

            int trees = 0, attempts = 0;
            while (trees < 170 && attempts < 4000)
            {
                attempts++;
                float x = (float)(rng.NextDouble() * 560.0 - 280.0);
                float z = (float)(rng.NextDouble() * 560.0 - 280.0);
                if (!TreeAllowed(x, z, playerXZ, enemyXZ, rng)) continue;
                float h = TerrainGenerator.GroundHeight(terrain, x, z);
                if (h > 95f) continue;
                float scale = 0.8f + (float)rng.NextDouble() * 0.7f;
                Tree(root.transform, new Vector3(x, h, z), scale, trunk, (trees % 2 == 0) ? leafA : leafB);
                trees++;
            }

            for (int i = 0; i < 70; i++)
            {
                float x = (float)(rng.NextDouble() * 560.0 - 280.0);
                float z = (float)(rng.NextDouble() * 560.0 - 280.0);
                if (Vector2.Distance(new Vector2(x, z), playerXZ) < 6f) continue;
                bool nearEnemy = false;
                foreach (var e in enemyXZ) if (Vector2.Distance(e, new Vector2(x, z)) < 5f) nearEnemy = true;
                if (nearEnemy) continue;
                var r = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                r.name = "Rock";
                r.transform.SetParent(root.transform, true);
                float s = 0.8f + (float)rng.NextDouble() * 2.2f;
                r.transform.position = new Vector3(x, TerrainGenerator.GroundHeight(terrain, x, z) + s * 0.25f, z);
                r.transform.localScale = new Vector3(s, s * 0.6f, s * 0.8f);
                r.transform.rotation = Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f);
                r.GetComponent<Renderer>().material = rockMat;
            }

            StaticBatchingUtility.Combine(root);
        }

        static bool TreeAllowed(float x, float z, Vector2 player, List<Vector2> enemies, System.Random rng)
        {
            var p = new Vector2(x, z);
            if (Vector2.Distance(p, player) < 35f) return false;
            // 플레이어 앞쪽 사면: 시야 확보를 위해 비워 둔다
            if (z > -205f && z < -110f && Mathf.Abs(x) < 150f) return false;
            foreach (var e in enemies)
            {
                if (Vector2.Distance(p, e) < 12f) return false;
            }
            // 적 사면/플레이어 사면에서는 사선(射線)을 가리는 위치를 피한다
            if (z > 120f || z < -120f)
            {
                foreach (var e in enemies)
                {
                    if (DistancePointSegment(p, player, e) < 6f) return false;
                }
            }
            // 적 능선 앞쪽은 듬성듬성
            if (z > 150f && z < 240f && Mathf.Abs(x) < 120f && rng.NextDouble() < 0.7) return false;
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

        static void Tree(Transform parent, Vector3 pos, float scale, Material trunk, Material leaf)
        {
            var t = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            t.name = "Trunk";
            t.transform.SetParent(parent, true);
            t.transform.position = pos + Vector3.up * (2f * scale);
            t.transform.localScale = new Vector3(0.35f * scale, 2f * scale, 0.35f * scale);
            t.GetComponent<Renderer>().material = trunk;

            var f1 = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            f1.name = "Foliage";
            f1.transform.SetParent(parent, true);
            f1.transform.position = pos + Vector3.up * (4.6f * scale);
            f1.transform.localScale = new Vector3(3.2f * scale, 3.6f * scale, 3.2f * scale);
            f1.GetComponent<Renderer>().material = leaf;

            var f2 = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            f2.name = "FoliageTop";
            f2.transform.SetParent(parent, true);
            f2.transform.position = pos + Vector3.up * (6.8f * scale);
            f2.transform.localScale = new Vector3(2.2f * scale, 2.4f * scale, 2.2f * scale);
            f2.GetComponent<Renderer>().material = leaf;
        }
    }
}
