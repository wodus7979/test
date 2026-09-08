using UnityEngine;

namespace SniperRidge
{
    /// <summary>Excavate the runtime terrain, before the player or decoration is placed.</summary>
    public static class TrenchTerrain
    {
        public const float FiringStepDepth = .90f;
        public const float RearDrop = .55f;

        static float BoxWeight(float x, float z, float halfWidth, float centreZ, float halfDepth)
        {
            float outside = Mathf.Max(Mathf.Abs(x) - halfWidth, Mathf.Abs(z - centreZ) - halfDepth);
            return 1f - Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(outside / .85f));
        }

        public static float DigWeight(float x, float z) => Mathf.Max(
            BoxWeight(x, z, 2.55f, -.35f, 1.80f), BoxWeight(x, z, 1.05f, -3.90f, 2.30f));

        public static bool IsInside(float x, float z) => DigWeight(x, z) > .001f;

        public static float FloorOffset(float z) => -RearDrop * (1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(-1.80f, -.95f, z)));

        public static Vector3 Excavate(Terrain terrain, Vector3 surface)
        {
            var data = terrain.terrainData;
            Vector3 floor = surface - Vector3.up * FiringStepDepth;
            Vector3 origin = terrain.transform.position;
            int res = data.heightmapResolution;
            float dx = data.size.x / (res - 1), dz = data.size.z / (res - 1);
            int x0 = Mathf.Clamp(Mathf.FloorToInt((surface.x - 4f - origin.x) / dx), 0, res - 1);
            int z0 = Mathf.Clamp(Mathf.FloorToInt((surface.z - 8f - origin.z) / dz), 0, res - 1);
            int x1 = Mathf.Clamp(Mathf.CeilToInt((surface.x + 4f - origin.x) / dx), x0, res - 1);
            int z1 = Mathf.Clamp(Mathf.CeilToInt((surface.z + 3f - origin.z) / dz), z0, res - 1);
            var heights = data.GetHeights(x0, z0, x1 - x0 + 1, z1 - z0 + 1);
            for (int z = 0; z < heights.GetLength(0); z++)
                for (int x = 0; x < heights.GetLength(1); x++)
                {
                    float wx = origin.x + (x0 + x) * dx - surface.x;
                    float wz = origin.z + (z0 + z) * dz - surface.z;
                    float target = (floor.y + FloorOffset(wz) - .16f - origin.y) / data.size.y;
                    heights[z, x] = Mathf.Lerp(heights[z, x], Mathf.Min(heights[z, x], target), DigWeight(wx, wz));
                }
            data.SetHeights(x0, z0, heights);
            PaintSoilAndClearGrass(terrain, surface);
            terrain.Flush();
            return floor;
        }

        static void PaintSoilAndClearGrass(Terrain terrain, Vector3 centre)
        {
            var data = terrain.terrainData;
            Vector3 origin = terrain.transform.position;
            // The generated terrain's third layer is dirt. Touch only the small local patch.
            int res = data.alphamapResolution;
            int x0 = Mathf.Clamp(Mathf.FloorToInt((centre.x - 4f - origin.x) / data.size.x * res), 0, res - 1);
            int z0 = Mathf.Clamp(Mathf.FloorToInt((centre.z - 8f - origin.z) / data.size.z * res), 0, res - 1);
            int w = Mathf.Min(res - x0, Mathf.CeilToInt(8f / data.size.x * res) + 2);
            int h = Mathf.Min(res - z0, Mathf.CeilToInt(11f / data.size.z * res) + 2);
            var map = data.GetAlphamaps(x0, z0, w, h);
            if (data.alphamapLayers >= 3)
            {
                for (int z = 0; z < h; z++)
                    for (int x = 0; x < w; x++)
                    {
                        float wx = origin.x + (x0 + x + .5f) / res * data.size.x - centre.x;
                        float wz = origin.z + (z0 + z + .5f) / res * data.size.z - centre.z;
                        float weight = DigWeight(wx, wz);
                        for (int layer = 0; layer < data.alphamapLayers; layer++)
                            map[z, x, layer] = Mathf.Lerp(map[z, x, layer], layer == 2 ? 1f : 0f, weight);
                    }
                data.SetAlphamaps(x0, z0, map);
            }
            res = data.detailResolution;
            if (res <= 0) return;
            x0 = Mathf.Clamp(Mathf.FloorToInt((centre.x - 4f - origin.x) / data.size.x * res), 0, res - 1);
            z0 = Mathf.Clamp(Mathf.FloorToInt((centre.z - 8f - origin.z) / data.size.z * res), 0, res - 1);
            w = Mathf.Min(res - x0, Mathf.CeilToInt(8f / data.size.x * res) + 2);
            h = Mathf.Min(res - z0, Mathf.CeilToInt(11f / data.size.z * res) + 2);
            for (int layer = 0; layer < data.detailPrototypes.Length; layer++)
            {
                var detail = data.GetDetailLayer(x0, z0, w, h, layer);
                for (int z = 0; z < h; z++)
                    for (int x = 0; x < w; x++)
                    {
                        float wx = origin.x + (x0 + x + .5f) / res * data.size.x - centre.x;
                        float wz = origin.z + (z0 + z + .5f) / res * data.size.z - centre.z;
                        // Include a cell-sized margin so billboards do not overlap the boards.
                        if (Mathf.Abs(wx) < 3.8f && wz > -7.5f && wz < 2.5f) detail[z, x] = 0;
                    }
                data.SetDetailLayer(x0, z0, layer, detail);
            }
        }
    }
}
