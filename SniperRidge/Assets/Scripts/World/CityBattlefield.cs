using System;
using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    public sealed class CityBattlefield : MonoBehaviour
    {
        public static readonly string[] RequiredModels = {
            "retail_row", "office_midrise", "office_tower", "apartment_slab", "auto_workshop", "warehouse",
            "street_20m", "sidewalk_10m", "street_lamp", "traffic_signal", "shipping_container",
            "concrete_barrier", "pallet_crates", "rooftop_hvac", "bus_shelter"
        };
        readonly Dictionary<string, GameObject> prefabs = new Dictionary<string, GameObject>();
        TerrainLayer pavement;
        public static bool IsReady
        {
            get
            {
                if (Resources.Load<TextAsset>("Maps/city_combat") == null) return false;
                foreach (string name in RequiredModels)
                    if (Resources.Load<GameObject>("CityPack/Prefabs/" + name) == null) return false;
                return Resources.Load<Material>("CityPack/Materials/Concrete") != null
                    && Resources.Load<Texture2D>("CityPack/Textures/asphalt_albedo") != null
                    && Resources.Load<Texture2D>("CityPack/Textures/asphalt_normal_unity") != null;
            }
        }
        public static void Build(GameManager gm)
        {
            if (!IsReady) throw new InvalidOperationException("Sniper Ridge → 도시 에셋 생성 메뉴를 먼저 실행하세요.");
            var root = new GameObject("City Battlefield").AddComponent<CityBattlefield>();
            root.Construct(gm);
        }
        GameObject Place(string asset, Vector3 position, float yaw = 0f, Vector3? scale = null)
        {
            if (!prefabs.TryGetValue(asset, out var prefab))
                prefabs[asset] = prefab = Resources.Load<GameObject>("CityPack/Prefabs/" + asset);
            if (prefab == null) throw new InvalidOperationException("도시 프리팹 누락: " + asset);
            var instance = Instantiate(prefab, position, Quaternion.Euler(0f, yaw, 0f), transform);
            instance.name = asset;
            if (scale.HasValue) instance.transform.localScale = scale.Value;
            return instance;
        }
        void Construct(GameManager gm)
        {
            // Replace the terrain's surface, not its collider: the dug checkpoint must stay open.
            pavement = new TerrainLayer {
                diffuseTexture = Resources.Load<Texture2D>("CityPack/Textures/asphalt_albedo"),
                normalMapTexture = Resources.Load<Texture2D>("CityPack/Textures/asphalt_normal_unity"),
                tileSize = new Vector2(2f, 2f), smoothness = .12f
            };
            var terrain = gm.Terrain;
            terrain.terrainData.terrainLayers = new[] { pavement };
            int res = terrain.terrainData.alphamapResolution;
            var weights = new float[res, res, 1];
            for (int y = 0; y < res; y++) for (int x = 0; x < res; x++) weights[y, x, 0] = 1f;
            terrain.terrainData.SetAlphamaps(0, 0, weights);
            terrain.detailObjectDensity = 0f;
            terrain.detailObjectDistance = 0f;
            terrain.Flush();

            foreach (var building in CityLayout.Data.buildings)
                Place(building.asset, building.Position, building.yaw);
            // Road slabs start beyond the dugout; props share the same data as the geometry checks.
            foreach (var prop in CityLayout.Data.props)
                Place(prop.asset, new Vector3(prop.x, prop.y, prop.z), prop.yaw,
                    new Vector3(prop.scale[0], prop.scale[1], prop.scale[2]));
            for (int i = 0; i < CityLayout.Data.posts.Length; i++)
            {
                if (gm.Mission == MissionType.Defense && i != 1 && i != 3 && i != 4 && i != 5) continue;
                AddPostCover(CityLayout.Spawn(i));
            }
            BuildCheckpoint(gm.Player.transform.position);
            // All building walls, roofs, parapets and props retain their original solid colliders.
            Physics.SyncTransforms();
            Debug.Log("[Sniper Ridge] 도시 전장 생성: 도로·상가·오피스, 옥상 사격 진지, 콘크리트 검문소.");
        }
        void AddPostCover(EnemySpawn spawn)
        {
            Vector3 ground = CityLayout.Ground(spawn);
            Vector3 toward = new Vector3(-ground.x, 0f, TerrainGenerator.PlayerSpawnZ - ground.z).normalized;
            Place("concrete_barrier", ground + toward * CityLayout.CoverDistance,
                Quaternion.LookRotation(toward).eulerAngles.y,
                new Vector3(1.4f, CityLayout.CoverHeight / 1.19f, 1f));
        }
        void BuildCheckpoint(Vector3 floor)
        {
            var material = Resources.Load<Material>("CityPack/Materials/Concrete");
            // This wall covers the ducked capsule even at the steepest authored rooftop angle.
            foreach (var block in CityLayout.Data.checkpoint)
                Box(block.name, floor + new Vector3(block.x, block.y, block.z),
                    new Vector3(block.size[0], block.size[1], block.size[2]), material);
        }
        void Box(string name, Vector3 position, Vector3 size, Material material)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name; go.transform.SetParent(transform, false);
            go.transform.position = position; go.transform.localScale = size;
            go.GetComponent<Renderer>().sharedMaterial = material;
        }
        void OnDestroy() { if (pavement != null) Destroy(pavement); }
    }
}
