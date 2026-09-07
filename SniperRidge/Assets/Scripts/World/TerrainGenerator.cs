using UnityEngine;

namespace SniperRidge
{
    /// <summary>
    /// 두 능선(플레이어 능선 / 적 능선)과 그 사이 계곡을 가진 지형을 코드로 생성한다.
    /// </summary>
    public static class TerrainGenerator
    {
        public const float Size = 600f;        // 가로/세로 (m)
        public const float MaxHeight = 120f;   // 최대 높이 (m)
        const int HeightRes = 257;
        const int AlphaRes = 256;

        public const float PlayerRidgeZ = -120f;
        public const float EnemyRidgeZ = 250f;

        public static float HeightMeters(float wx, float wz, float seed)
        {
            float u = (wx + Size * 0.5f) / Size;
            float v = (wz + Size * 0.5f) / Size;

            float baseH = 8f
                        + 7f * Mathf.PerlinNoise(u * 4f + seed, v * 4f + seed)
                        + 3f * Mathf.PerlinNoise(u * 13f + seed * 2f, v * 13f);

            float playerCrest = PlayerRidgeZ + 15f * Mathf.Sin(wx / 90f);
            float playerRidge = Gauss(wz - playerCrest, 45f) * 46f
                              * (0.85f + 0.3f * Mathf.PerlinNoise(u * 3f + seed, 0.37f));

            float enemyCrest = EnemyRidgeZ + 10f * Mathf.Sin(wx / 70f + 1f);
            float enemyRidge = Gauss(wz - enemyCrest, 60f) * 60f
                             * (0.85f + 0.3f * Mathf.PerlinNoise(u * 2.5f + seed, 0.71f));

            float rim = 45f * Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(275f, 300f, Mathf.Abs(wz)))
                      + 35f * Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(240f, 300f, Mathf.Abs(wx)));

            return baseH + playerRidge + enemyRidge + rim;
        }

        static float Gauss(float d, float sigma)
        {
            return Mathf.Exp(-(d * d) / (2f * sigma * sigma));
        }

        public static Terrain Build(float seed)
        {
            var data = new TerrainData();
            data.heightmapResolution = HeightRes;
            data.size = new Vector3(Size, MaxHeight, Size);

            var heights = new float[HeightRes, HeightRes];
            for (int z = 0; z < HeightRes; z++)
            {
                float wz = z / (float)(HeightRes - 1) * Size - Size * 0.5f;
                for (int x = 0; x < HeightRes; x++)
                {
                    float wx = x / (float)(HeightRes - 1) * Size - Size * 0.5f;
                    heights[z, x] = Mathf.Clamp01(HeightMeters(wx, wz, seed) / MaxHeight);
                }
            }
            data.SetHeights(0, 0, heights);

            var grass = new TerrainLayer
            {
                diffuseTexture = ProceduralAssets.NoiseTexture(256, new Color(0.20f, 0.36f, 0.12f), new Color(0.36f, 0.50f, 0.20f), 3f, 0.3f),
                tileSize = new Vector2(7f, 7f),
            };
            var rock = new TerrainLayer
            {
                diffuseTexture = ProceduralAssets.NoiseTexture(256, new Color(0.40f, 0.40f, 0.38f), new Color(0.60f, 0.58f, 0.54f), 5f, 1.7f),
                tileSize = new Vector2(9f, 9f),
            };
            var dirt = new TerrainLayer
            {
                diffuseTexture = ProceduralAssets.NoiseTexture(256, new Color(0.36f, 0.28f, 0.16f), new Color(0.52f, 0.42f, 0.26f), 4f, 2.9f),
                tileSize = new Vector2(6f, 6f),
            };
            data.terrainLayers = new[] { grass, rock, dirt };

            data.alphamapResolution = AlphaRes;
            var maps = new float[AlphaRes, AlphaRes, 3];
            for (int y = 0; y < AlphaRes; y++)
            {
                float ny = (y + 0.5f) / AlphaRes;
                for (int x = 0; x < AlphaRes; x++)
                {
                    float nx = (x + 0.5f) / AlphaRes;
                    float steep = data.GetSteepness(nx, ny);
                    float h = data.GetInterpolatedHeight(nx, ny);
                    float rockW = Mathf.InverseLerp(22f, 38f, steep);
                    float dirtW = (1f - rockW) * Mathf.InverseLerp(20f, 9f, h) * 0.8f;
                    float grassW = Mathf.Max(0f, 1f - rockW - dirtW);
                    maps[y, x, 0] = grassW;
                    maps[y, x, 1] = rockW;
                    maps[y, x, 2] = dirtW;
                }
            }
            data.SetAlphamaps(0, 0, maps);

            AddGrassDetail(data);

            var go = Terrain.CreateTerrainGameObject(data);
            go.name = "Terrain";
            go.transform.position = new Vector3(-Size * 0.5f, 0f, -Size * 0.5f);
            var terrain = go.GetComponent<Terrain>();
            terrain.heightmapPixelError = 4f;
            terrain.basemapDistance = 2000f;
            terrain.detailObjectDistance = Application.isMobilePlatform ? 60f : 110f;
            terrain.detailObjectDensity = Application.isMobilePlatform ? 0.35f : 0.7f;
            return terrain;
        }

        /// <summary>풀잎 빌보드 디테일 레이어. 완만한 초지 위주로 깔린다.</summary>
        static void AddGrassDetail(TerrainData data)
        {
            const int DetailRes = 512;
            var proto = new DetailPrototype
            {
                prototypeTexture = ProceduralAssets.GrassBladeTexture(),
                renderMode = DetailRenderMode.GrassBillboard,
                usePrototypeMesh = false,
                minWidth = 0.7f,
                maxWidth = 1.3f,
                minHeight = 0.5f,
                maxHeight = 1.0f,
                healthyColor = new Color(0.45f, 0.7f, 0.3f),
                dryColor = new Color(0.65f, 0.6f, 0.3f),
                noiseSpread = 0.25f,
            };
            data.SetDetailResolution(DetailRes, 32);
            data.detailPrototypes = new[] { proto };
            data.wavingGrassStrength = 0.4f;
            data.wavingGrassAmount = 0.3f;
            data.wavingGrassSpeed = 0.4f;
            data.wavingGrassTint = new Color(0.8f, 0.85f, 0.6f);

            var layer = new int[DetailRes, DetailRes];
            for (int y = 0; y < DetailRes; y++)
            {
                float ny = (y + 0.5f) / DetailRes;
                for (int x = 0; x < DetailRes; x++)
                {
                    float nx = (x + 0.5f) / DetailRes;
                    float steep = data.GetSteepness(nx, ny);
                    float h = data.GetInterpolatedHeight(nx, ny);
                    if (steep > 28f || h > 95f) continue;
                    float n = Mathf.PerlinNoise(nx * 40f, ny * 40f);
                    int density = Mathf.RoundToInt(Mathf.Lerp(1f, 7f, n) * Mathf.InverseLerp(28f, 15f, steep));
                    layer[y, x] = density;
                }
            }
            data.SetDetailLayer(0, 0, 0, layer);
        }

        public static float GroundHeight(Terrain terrain, float wx, float wz)
        {
            return terrain.SampleHeight(new Vector3(wx, 0f, wz)) + terrain.transform.position.y;
        }

        public static Vector3 OnGround(Terrain terrain, float wx, float wz, float lift = 0f)
        {
            return new Vector3(wx, GroundHeight(terrain, wx, wz) + lift, wz);
        }
    }
}
