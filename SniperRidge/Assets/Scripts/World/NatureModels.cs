using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Shared pack meshes at close/scope distances, cheap original silhouettes at long distances.</summary>
    public static class NatureModels
    {
        static readonly Dictionary<string, GameObject> Prefabs = new Dictionary<string, GameObject>();
        static bool warned;

        static GameObject Load(string name)
        {
            if (!Prefabs.TryGetValue(name, out var prefab) || prefab == null)
            {
                prefab = Resources.Load<GameObject>("NaturePack/Prefabs/" + name);
                Prefabs[name] = prefab;
                if (prefab == null && !warned)
                {
                    warned = true;
                    Debug.LogWarning("[Sniper Ridge] 자연 팩이 없습니다. Sniper Ridge > 고품질 자연 에셋 생성 메뉴를 실행하세요.");
                }
            }
            return prefab;
        }

        public static GameObject Upgrade(GameObject original, string name)
        {
            if (Application.isMobilePlatform) return original;
            var prefab = Load(name);
            if (prefab == null) return original;
            var proxy = original.GetComponent<MeshRenderer>();
            var oldBounds = original.GetComponent<MeshFilter>().sharedMesh.bounds;
            var sourceBounds = prefab.GetComponentInChildren<MeshFilter>().sharedMesh.bounds;
            var detailed = Object.Instantiate(prefab, original.transform, false);
            float scale = oldBounds.size.y / Mathf.Max(.001f, sourceBounds.size.y);
            detailed.transform.localScale = Vector3.one * scale;
            detailed.transform.localPosition = new Vector3(0, oldBounds.min.y - sourceBounds.min.y * scale, 0);
            var packGroup = detailed.GetComponent<LODGroup>();
            var packLods = packGroup.GetLODs();
            packGroup.enabled = false;
            Object.Destroy(packGroup);
            var group = original.AddComponent<LODGroup>();
            // Screen size, rather than distance alone, also responds to scope FOV.
            group.SetLODs(new[] {
                new LOD(.20f, packLods[0].renderers),
                new LOD(.025f, packLods[1].renderers),
                new LOD(.0007f, new Renderer[] { proxy })
            });
            group.RecalculateBounds();
            return original;
        }

        public static void GroundCover(Transform parent, Terrain terrain, Vector3 nest)
        {
            if (Application.isMobilePlatform) return;
            var rng = new System.Random(814);
            for (int i = 0; i < 420; i++)
            {
                float x = (float)(rng.NextDouble() * 54 - 27);
                float z = (float)(rng.NextDouble() * 42 - 18);
                // Keep the firing slot and sandbags free of foliage.
                if (TrenchTerrain.IsInside(x, z) || x * x + z * z < 7 || (z > 0 && Mathf.Abs(x) < 3.5f)) continue;
                var position = TerrainGenerator.OnGround(terrain, nest.x + x, nest.z + z, -.03f);
                Vector3 normal = terrain.terrainData.GetInterpolatedNormal(
                    (position.x - terrain.transform.position.x) / terrain.terrainData.size.x,
                    (position.z - terrain.transform.position.z) / terrain.terrainData.size.z);
                if (normal.y < .85f) continue;
                var prefab = Load(i % 5 == 0 ? "grass_tall" : "grass_short");
                if (prefab == null) return;
                var go = Object.Instantiate(prefab, position, Quaternion.Euler(0, (float)rng.NextDouble() * 360f, 0), parent);
                go.transform.localScale = Vector3.one * (.45f + (float)rng.NextDouble() * .55f);
            }
        }
    }
}
