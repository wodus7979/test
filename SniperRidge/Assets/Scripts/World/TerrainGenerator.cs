using UnityEngine;

namespace SniperRidge
{
    /// <summary>
    /// 중앙 전투 구역은 평지로 유지하고 외곽에 완만한 능선을 생성한다.
    /// </summary>
    public static class TerrainGenerator
    {
        public const float Size = 600f;        // 가로/세로 (m)
        public const float MaxHeight = 200f;   // 최대 높이 (m)

        public const float PlayerSpawnZ = -100f;
        public const float FieldElevation = 12f;

        // Keep all combat and driving routes level; raise only the distant boundary.
        // TrenchTerrain excavates only the player's small dugout after terrain creation.
        public static float HeightMeters(float wx, float wz, float seed)
        {
            float edge = Mathf.SmoothStep(0f,1f,Mathf.InverseLerp(240f,295f,Mathf.Max(Mathf.Abs(wx),Mathf.Abs(wz))));
            return FieldElevation + edge * (8f + Mathf.PerlinNoise(wx*.025f+seed,wz*.025f)*20f);
        }

        public static Terrain Build(float seed)
        {
            int heightRes = Application.isMobilePlatform ? 257 : 1025;
            int alphaRes = Application.isMobilePlatform ? 256 : 1024;
            var data = new TerrainData();
            data.heightmapResolution = heightRes;
            data.size = new Vector3(Size, MaxHeight, Size);

            var heights = new float[heightRes, heightRes];
            for (int z = 0; z < heightRes; z++)
            {
                float wz = z / (float)(heightRes - 1) * Size - Size * 0.5f;
                for (int x = 0; x < heightRes; x++)
                {
                    float wx = x / (float)(heightRes - 1) * Size - Size * 0.5f;
                    heights[z, x] = Mathf.Clamp01(HeightMeters(wx, wz, seed) / MaxHeight);
                }
            }
            data.SetHeights(0, 0, heights);

            var grass = MakeLayer("grass", new Color(0.20f, 0.36f, 0.12f), new Color(0.36f, 0.50f, 0.20f), 3f, 0.3f, 6f);
            var rock = MakeLayer("rock", new Color(0.40f, 0.40f, 0.38f), new Color(0.60f, 0.58f, 0.54f), 5f, 1.7f, 7f);
            var dirt = MakeLayer("dirt", new Color(0.36f, 0.28f, 0.16f), new Color(0.52f, 0.42f, 0.26f), 4f, 2.9f, 5f);
            var forest = MakeLayer("forest", new Color(0.22f, 0.17f, 0.10f), new Color(0.32f, 0.26f, 0.15f), 4f, 3.7f, 5f);
            data.terrainLayers = new[] { grass, rock, dirt, forest };

            data.alphamapResolution = alphaRes;
            var maps = new float[alphaRes, alphaRes, 4];
            for (int y = 0; y < alphaRes; y++)
            {
                float ny = (y + 0.5f) / alphaRes;
                for (int x = 0; x < alphaRes; x++)
                {
                    float nx = (x + 0.5f) / alphaRes;
                    float steep = data.GetSteepness(nx, ny);
                    float h = data.GetInterpolatedHeight(nx, ny);
                    float rockW = Mathf.InverseLerp(20f, 34f, steep) + 0.35f * Mathf.InverseLerp(0.62f, 0.8f, Mathf.PerlinNoise(nx * 9f + seed, ny * 9f))
                                + Mathf.InverseLerp(120f, 160f, h);   // 높은 산은 바위
                    rockW = Mathf.Clamp01(rockW);
                    float track = BattlefieldScenery.TrackWeight(nx * Size - Size*.5f,ny * Size - Size*.5f);
                    float dirtW = (1f - rockW) * Mathf.Max(track,Mathf.Lerp(.08f,.48f,Mathf.PerlinNoise(nx*19f+seed,ny*19f)));
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
            terrain.heightmapPixelError = Application.isMobilePlatform ? 4f : 1.5f;
            terrain.basemapDistance = 2000f;
            terrain.drawInstanced = !Application.isMobilePlatform;
            terrain.detailObjectDistance = Application.isMobilePlatform ? 60f : 180f;
            terrain.detailObjectDensity = Application.isMobilePlatform ? 0.35f : 0.85f;
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
                smoothness = 0f, metallic = 0f, specular = Color.black,
            };
            if (normal != null)
            {
                layer.normalMapTexture = normal;
                layer.normalScale = .4f;
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
                minHeight = 0.15f,
                maxHeight = 0.35f,
                healthyColor = new Color(0.42f, 0.52f, 0.28f),
                dryColor = new Color(0.55f, 0.50f, 0.31f),
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
                    if (steep > 25f || h > 110f) continue;
                    float n = Mathf.PerlinNoise(nx * 40f, ny * 40f);
                    int density = Mathf.RoundToInt(Mathf.Lerp(1f, 7f, n) * Mathf.InverseLerp(28f, 15f, steep));
                    float wx = nx * Size - Size * .5f, wz = ny * Size - Size * .5f;
                    float track = BattlefieldScenery.TrackWeight(wx,wz);
                    density = Mathf.RoundToInt(density * (1f-track));
                    layer[y, x] = BattlefieldLayout.IsCombatLane(wx, wz) ? Mathf.Min(density, 2) : density;
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
