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
            SetupAmbience(gm);

            var terrain = TerrainGenerator.Build(Seed);
            gm.Terrain = terrain;

            Vector3 surface = TerrainGenerator.OnGround(terrain, 0f, TerrainGenerator.PlayerSpawnZ);
            Vector3 nest = TrenchTerrain.Excavate(terrain, surface);
            BuildPlayer(gm, nest);
            // The selected map is built on deployment, before spawning any enemies.

            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            gm.Hud = HudController.Build(gm);
            if (Application.isMobilePlatform) TouchControls.Build(gm);
            // 적은 무기 선택 후 GameManager.StartMission 에서 생성된다.
        }

        public static void PrepareMap(GameManager gm)
        {
            if (gm.Mission == MissionType.Assault) AssaultWorld.Build(gm);
            else if (gm.Mission == MissionType.Tank) BattlefieldScenery.BuildTankField(gm);
            else if (gm.Map == BattlefieldMap.City) { CityBattlefield.Build(gm); BattlefieldScenery.CityDetails(gm); }
            else
            {
                if (gm.Mission != MissionType.Helicopter) TrenchBuilder.Build(gm.Terrain, gm.Player.transform.position);
                BuildDecorations(gm.Terrain, gm.Player.transform.position, EnemySpawns());
                BattlefieldScenery.FieldDetails(gm);
            }
            SetupReflection(gm.Player.transform.position);
        }

        // ---------- 조명 / 환경 ----------

        static void SetupLighting()
        {
            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.94f, 0.85f);
            sun.intensity = 1.05f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.85f;
            sun.shadowBias = 0.03f;
            sun.shadowNormalBias = 0.25f;
            sunGo.transform.rotation = Quaternion.Euler(42f, -35f, 0f);
            RenderSettings.sun = sun;

            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = 0.00065f;
            RenderSettings.fogColor = new Color(0.66f, 0.72f, 0.80f);
            RenderSettings.ambientIntensity = 0.9f;

            // 실사 하늘 (Resources/Sky 의 HDRI) + 환경광
            var hdr = ProceduralAssets.LoadTex("Sky/quarry_01_1k");
            var skyShader = Shader.Find("Skybox/Panoramic");
            if (hdr != null && skyShader != null)
            {
                var sky = new Material(skyShader);
                sky.SetTexture("_MainTex", hdr);
                if (sky.HasProperty("_Exposure")) sky.SetFloat("_Exposure", 0.9f);
                if (sky.HasProperty("_Rotation")) sky.SetFloat("_Rotation", 40f);
                RenderSettings.skybox = sky;
                RenderSettings.ambientMode = AmbientMode.Skybox;
                RenderSettings.ambientIntensity = 0.65f;
                RenderSettings.fogColor = new Color(0.70f, 0.74f, 0.80f);
                DynamicGI.UpdateEnvironment();
            }

            bool mobile = Application.isMobilePlatform;
            QualitySettings.shadowDistance = mobile ? 90f : 460f;
            QualitySettings.shadowCascades = mobile ? 2 : 4;
            QualitySettings.shadowResolution = mobile ? ShadowResolution.Medium : ShadowResolution.VeryHigh;
            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.ForceEnable;
            QualitySettings.antiAliasing = mobile ? 2 : 4;
            QualitySettings.lodBias = mobile ? 1f : 1.25f;
            QualitySettings.shadowCascade4Split = new Vector3(.08f, .23f, .5f);
            QualitySettings.pixelLightCount = mobile ? 2 : 8;
            RenderSettings.reflectionIntensity = .42f;
        }

        static void SetupReflection(Vector3 nest)
        {
            if (Application.isMobilePlatform) return;
            var go = new GameObject("Nest Reflection");
            go.transform.position = nest + Vector3.up * 2f;
            var probe = go.AddComponent<ReflectionProbe>();
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.AllFacesAtOnce;
            probe.resolution = 256;
            probe.hdr = true;
            probe.size = new Vector3(600f, 400f, 600f);
            probe.boxProjection = false;
            probe.clearFlags = ReflectionProbeClearFlags.Skybox;
            probe.farClipPlane = 900f;
            probe.nearClipPlane = 3f;
            // Ignore UI and effects layers; a 3 m near plane excludes the first-person weapon.
            probe.cullingMask = ~(1 << 2 | 1 << 5);
            probe.RenderProbe();
        }

        static void SetupAmbience(GameManager gm)
        {
            if (gm.Sounds == null || gm.Sounds.Wind == null) return;
            var go = new GameObject("Ambience");
            var src = go.AddComponent<AudioSource>();
            gm.Ambience = src;
            src.clip = gm.Sounds.Wind;
            src.loop = true;
            src.volume = 0.35f;
            src.spatialBlend = 0f;
            src.playOnAwake = false;
            src.Play();
        }

        // ---------- 플레이어 ----------

        static void BuildPlayer(GameManager gm, Vector3 nest)
        {
            var player = new GameObject("Player");
            player.transform.position = nest;
            player.transform.rotation = Quaternion.identity; // +Z (전방 전투 구역)

            var eyeGo = new GameObject("Eye");
            eyeGo.transform.SetParent(player.transform, false);
            eyeGo.transform.localPosition = new Vector3(0f, CounterfireRules.StandingEye, 0f);
            eyeGo.tag = "MainCamera";
            var cam = eyeGo.AddComponent<Camera>();
            cam.fieldOfView = 60f;
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 3000f;
            cam.allowHDR = true;
            cam.allowMSAA = true;
            eyeGo.AddComponent<AudioListener>();
            var post = eyeGo.AddComponent<PostEffect>();
            post.Exposure = .98f; post.Saturation = .92f;
            post.BloomIntensity = Application.isMobilePlatform ? 0.2f : 0.16f;

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


        }

        // ---------- 적 ----------

        static List<EnemySpawn> EnemySpawns() => BattlefieldLayout.SniperSpawns();

        static Material enemyBody, enemySkin, enemyGear, enemyRock;

        static void EnsureEnemyMaterials()
        {
            if (enemyBody != null) return;
            enemyBody = ProceduralAssets.LitMaterial(new Color(0.44f, 0.42f, 0.28f), 0.05f);
            enemySkin = ProceduralAssets.LitMaterial(new Color(0.78f, 0.62f, 0.48f), 0.1f);
            enemyGear = ProceduralAssets.LitMaterial(new Color(0.12f, 0.13f, 0.11f), 0.2f);
            enemyRock = ProceduralAssets.TexturedMaterial(new Color(0.85f, 0.83f, 0.8f), ProceduralAssets.LoadTex("Terrain/rock_albedo"), ProceduralAssets.LoadTex("Terrain/rock_normal"), 0.6f, 0.05f);
        }

        static Transform EnemyRoot()
        {
            var existing = GameObject.Find("Enemies");
            return (existing != null ? existing : new GameObject("Enemies")).transform;
        }

        /// <summary>저격 임무: 가까운 평지에 엄폐/순찰 적 배치.</summary>
        public static void SpawnSniperEnemies(GameManager gm)
        {
            EnsureEnemyMaterials();
            var rng = new System.Random(77);
            var root = EnemyRoot();
            var spawns = gm.Map == BattlefieldMap.City ? CityLayout.SniperSpawns() : EnemySpawns();
            Vector3 playerPos = gm.PlayerEye.position;
            for (int i = 0; i < spawns.Count; i++)
            {
                var e = EnemySoldier.Create("Enemy_" + (i + 1), gm.Terrain, spawns[i], playerPos, gm.Map == BattlefieldMap.City ? CityLayout.EnemyScale : EnemySoldier.SniperModeScale,
                                            enemyBody, enemySkin, enemyGear, enemyRock, rng, createCover: gm.Map != BattlefieldMap.City);
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

        public static EnemySoldier SpawnDefenseSoldier(GameManager gm, System.Random random, int wave, int index)
        {
            EnsureEnemyMaterials();
            var spawn = gm.Map == BattlefieldMap.City ? CityLayout.DefenseSpawn(random, wave, index)
                : BattlefieldLayout.DefenseSoldier(random, wave, index);
            string name = "Wave_" + wave + "_Soldier_" + (index + 1);
            var enemy = EnemySoldier.Create(name, gm.Terrain, spawn, gm.PlayerEye.position, EnemySoldier.DefenseModeScale,
                enemyBody, enemySkin, enemyGear, enemyRock, random, createCover: gm.Map != BattlefieldMap.City && wave == 1);
            // The same two rock positions are reused each wave, without stacking new cover colliders.
            enemy.transform.SetParent(EnemyRoot(), true);
            gm.RegisterEnemy(enemy);
            return enemy;
        }

        public static EnemySoldier SpawnAssaultSoldier(GameManager gm,Vector3 p,bool cover,int ordinal,EnemyRole role=EnemyRole.MachineGunner,bool ally=false,bool roof=false)
        {
            EnsureEnemyMaterials();
            var spawn=new EnemySpawn(p.x,p.z,cover?EnemyKind.Cover:EnemyKind.Rusher,
                role:role,uniformVariant:ordinal%3,surfaceY:roof?p.y:float.NaN);
            var enemy=EnemySoldier.Create("Urban enemy "+ordinal,gm.Terrain,spawn,gm.PlayerEye.position,AssaultLayout.EnemyScale,
                enemyBody,enemySkin,enemyGear,enemyRock,new System.Random(ordinal+9201),false);
            enemy.transform.SetParent(EnemyRoot(),true);if(!ally)gm.RegisterEnemy(enemy);
            var combat=enemy.gameObject.AddComponent<InfantryCombat>();combat.Ally=ally;combat.Post=cover;combat.SquadIndex=ordinal%4;
            enemy.AttachCombat(combat);
            if(!cover)
            {
                enemy.gameObject.AddComponent<AssaultNavigation>();
            }
            return enemy;
        }

        public static EnemySoldier SpawnRocketTrooper(GameManager gm, Vector3 position, string name)
        {
            EnsureEnemyMaterials();
            var spawn = new EnemySpawn(position.x,position.z,EnemyKind.Cover,role:EnemyRole.RocketTrooper);
            var enemy = EnemySoldier.Create(name,gm.Terrain,spawn,gm.PlayerEye.position,EnemySoldier.DefenseModeScale,
                enemyBody,enemySkin,enemyGear,enemyRock,new System.Random(name.GetHashCode()),false);
            enemy.transform.SetParent(EnemyRoot(),true);gm.RegisterEnemy(enemy);return enemy;
        }

        public static EnemySoldier SpawnHelicopterEnemy(GameManager gm,Vector3 position,string name,EnemyRole role)
        {
            EnsureEnemyMaterials();
            var spawn=new EnemySpawn(position.x,position.z,role==EnemyRole.RocketTrooper?EnemyKind.Cover:EnemyKind.Rusher,role:role);
            float scale=gm.Map==BattlefieldMap.City?CityLayout.EnemyScale:EnemySoldier.DefenseModeScale;
            var enemy=EnemySoldier.Create(name,gm.Terrain,spawn,gm.PlayerEye.position,scale,
                enemyBody,enemySkin,enemyGear,enemyRock,new System.Random(name.GetHashCode()),false);
            enemy.transform.SetParent(EnemyRoot(),true);gm.RegisterEnemy(enemy);return enemy;
        }

        // ---------- 장식 (숲, 덤불, 바위) ----------

        static void BuildDecorations(Terrain terrain, Vector3 playerPos, List<EnemySpawn> spawns)
        {
            var rng = new System.Random(1234);
            var root = new GameObject("Decorations");
            var rockMat = ProceduralAssets.TexturedMaterial(new Color(0.85f, 0.83f, 0.8f), ProceduralAssets.LoadTex("Terrain/rock_albedo"), ProceduralAssets.LoadTex("Terrain/rock_normal"), 0.6f, 0.05f);

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

            // Woodland frames a clear, flat combat field instead of filling the old valley.
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, -280f, 280f, 30f, 270f, 300, .75f, .8f);
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, -280f, -95f, -120f, 30f, 100, .45f, .7f);
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, 95f, 280f, -120f, 30f, 100, .45f, .7f);
            placed += Forest(root.transform, terrain, rng, playerXZ, enemyXZ, -280f, 280f, -280f, -135f, 140, .65f, .7f);

            // 덤불
            for (int i = 0; i < 160; i++)
            {
                float x = (float)(rng.NextDouble() * 560.0 - 280.0);
                float z = (float)(rng.NextDouble() * 560.0 - 280.0);
                if (!TreeAllowed(x, z, playerXZ, enemyXZ)) continue;
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
                r.GetComponent<Renderer>().sharedMaterial = rockMat;
                NatureModels.Upgrade(r, i % 2 == 0 ? "boulder_1" : "boulder_2");
            }

            NatureModels.GroundCover(root.transform, terrain, playerPos);
            // GPU instancing keeps repeated meshes shared and allows each LOD renderer to cull independently.
            if (Application.isMobilePlatform) StaticBatchingUtility.Combine(root);
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
            if (Vector2.Distance(p, player) < 24f || BattlefieldLayout.IsCombatLane(x, z)) return false;
            if (NearEnemy(p, enemies, 7f)) return false;
            // 순찰 경로 위에는 놓지 않는다
            foreach (var r in patrolRoutes)
            {
                if (DistancePointSegment(p, new Vector2(r.x, r.y), new Vector2(r.z, r.w)) < 5f) return false;
            }
            foreach (var e in enemies)
                if (DistancePointSegment(p, player, e) < 6f) return false;
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
