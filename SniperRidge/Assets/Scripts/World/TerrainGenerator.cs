using UnityEngine;

namespace SniperRidge
{
    /// <summary>
    /// 두 능선(플레이어 능선 / 적 능선)과 그 사이 계곡을 가진 지형을 코드로 생성한다.
    /// </summary>
    public static class TerrainGenerator
    {
        public const float Size = 600f;        // 가로/세로 (m)
        public const float MaxHeight = 200f;   // 최대 높이 (m)
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

            // 가장자리 산맥: 지평선을 가려 하늘 HDRI 의 지면이 보이지 않게 한다
            float rimZ = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(262f, 300f, Mathf.Abs(wz)));
            float rimX = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(225f, 300f, Mathf.Abs(wx)));
            float rimNoise = 0.7f + 0.6f * Mathf.PerlinNoise(u * 6f + seed * 3f, v * 6f);
            float rim = (110f * rimZ + 95f * rimX) * rimNoise;

            // 능선/골짜기 세부 굴곡 (ridged noise): 경사면일수록 강하게
            float ridged = 1f - Mathf.Abs(2f * Mathf.PerlinNoise(u * 18f + seed, v * 18f) - 1f);
            float ridged2 = 1f - Mathf.Abs(2f * Mathf.PerlinNoise(u * 40f + seed * 2f, v * 40f) - 1f);
            float slopeMask = Mathf.Clamp01((playerRidge + enemyRidge + rim) / 60f);
            float detail = (4.5f * ridged * ridged + 1.5f * ridged2) * (0.3f + 0.7f * slopeMask)
                         + 1.2f * Mathf.PerlinNoise(u * 60f, v * 60f + seed);
            // 사수 위치 주변과 적 배치 사면은 굴곡을 줄여 사선이 막히지 않게 한다
            detail *= (1f - 0.9f * Gauss(wz - PlayerRidgeZ, 45f)) * (1f - 0.75f * Gauss(wz - 212f, 30f));

            return baseH + playerRidge + enemyRidge + rim + detail;
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

            var grass = MakeLayer("grass", new Color(0.20f, 0.36f, 0.12f), new Color(0.36f, 0.50f, 0.20f), 3f, 0.3f, 6f);
            var rock = MakeLayer("rock", new Color(0.40f, 0.40f, 0.38f), new Color(0.60f, 0.58f, 0.54f), 5f, 1.7f, 7f);
            var dirt = MakeLayer("dirt", new Color(0.36f, 0.28f, 0.16f), new Color(0.52f, 0.42f, 0.26f), 4f, 2.9f, 5f);
            var forest = MakeLayer("forest", new Color(0.22f, 0.17f, 0.10f), new Color(0.32f, 0.26f, 0.15f), 4f, 3.7f, 5f);
            data.terrainLayers = new[] { grass, rock, dirt, forest };

            data.alphamapResolution = AlphaRes;
            var maps = new float[AlphaRes, AlphaRes, 4];
            for (int y = 0; y < AlphaRes; y++)
            {
                float ny = (y + 0.5f) / AlphaRes;
                for (int x = 0; x < AlphaRes; x++)
                {
                    float nx = (x + 0.5f) / AlphaRes;
                    float steep = data.GetSteepness(nx, ny);
                    float h = data.GetInterpolatedHeight(nx, ny);
                    float rockW = Mathf.InverseLerp(20f, 34f, steep) + 0.35f * Mathf.InverseLerp(0.62f, 0.8f, Mathf.PerlinNoise(nx * 9f + seed, ny * 9f))
                                + Mathf.InverseLerp(120f, 160f, h);   // 높은 산은 바위
                    rockW = Mathf.Clamp01(rockW);
                    float dirtW = (1f - rockW) * Mathf.InverseLerp(20f, 9f, h) * 0.8f;
                    float forestW = (1f - rockW - dirtW) * Mathf.InverseLerp(0.5f, 0.72f, Mathf.PerlinNoise(nx * 5f + seed * 2f, ny * 5f + 3f)) * 0.9f;
                    float grassW = Mathf.Max(0f, 1f - rockW - dirtW - forestW);
                    maps[y, x, 0] = grassW;
                    maps[y, x, 1] = rockW;
                    maps[y, x, 2] = dirtW;
                    maps[y, x, 3] = forestW;
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

        /// <summary>Resources/Terrain 의 실사 텍스처가 있으면 사용하고, 없으면 절차적 노이즈 텍스처.</summary>
        static TerrainLayer MakeLayer(string name, Color fallbackA, Color fallbackB, float noiseScale, float seed, float tile)
        {
            var albedo = ProceduralAssets.LoadTex("Terrain/" + name + "_albedo");
            var normal = ProceduralAssets.LoadTex("Terrain/" + name + "_normal");
            var layer = new TerrainLayer
            {
                diffuseTexture = albedo != null ? albedo : ProceduralAssets.NoiseTexture(256, fallbackA, fallbackB, noiseScale, seed),
                tileSize = new Vector2(tile, tile),
                smoothness = 0.05f,
            };
            if (normal != null)
            {
                layer.normalMapTexture = normal;
                layer.normalScale = 1f;
            }
            return layer;
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
                    if (steep > 28f || h > 110f) continue;
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
