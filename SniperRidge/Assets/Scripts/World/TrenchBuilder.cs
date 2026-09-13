using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>A dug firing bay and deeper rear communication trench, built over excavated terrain.</summary>
    public sealed class TrenchBuilder : MonoBehaviour
    {
        readonly List<Object> generated = new List<Object>();
        readonly System.Random random = new System.Random(197);
        Terrain terrain;
        Mesh timberMesh, bagMesh;
        Material timber, earth, canvas, metal, wetMud, thread;

        public static void Build(Terrain terrain, Vector3 floor)
        {
            var go = new GameObject("Dugout Trench");
            go.transform.position = floor;
            var trench = go.AddComponent<TrenchBuilder>();
            trench.terrain = terrain;
            trench.Construct();
        }

        T Own<T>(T resource) where T : Object { generated.Add(resource); return resource; }
        float R(float lo, float hi) => Mathf.Lerp(lo, hi, (float)random.NextDouble());

        void Construct()
        {
            timberMesh = Own(TrenchGeometry.RoundedBox(3, .045f, false));
            bagMesh = Own(TrenchGeometry.RoundedBox(8, .18f, true));
            timber = Own(ProceduralAssets.TexturedMaterial(new Color(.63f, .48f, .32f), Own(TrenchGeometry.SurfaceTexture(false)), null, 1f, .08f));
            canvas = Own(ProceduralAssets.TexturedMaterial(new Color(.77f, .71f, .51f), Own(TrenchGeometry.SurfaceTexture(true)), null, 2f, .01f));
            earth = Own(ProceduralAssets.TexturedMaterial(new Color(.48f, .36f, .23f), ProceduralAssets.LoadTex("Terrain/dirt_albedo"), ProceduralAssets.LoadTex("Terrain/dirt_normal"), 1f, .03f));
            metal = Own(SurfaceDetail.Make(Surface.Steel, new Color(.13f, .15f, .13f), .28f));
            wetMud = Own(ProceduralAssets.LitMaterial(new Color(.14f, .12f, .08f), .62f));
            thread = Own(ProceduralAssets.LitMaterial(new Color(.30f, .25f, .15f), .01f));
            foreach (var material in new[] { timber, canvas, earth, metal, wetMud, thread }) material.enableInstancing = true;

            // Clockwise boundary: wood faces inward, earth backing faces outward.
            Wall("Front", new Vector3(-2.32f, 0f, 1.18f), new Vector3(2.32f, 0f, 1.18f), -.12f, .94f);
            Wall("Right", new Vector3(2.32f, 0f, 1.18f), new Vector3(2.32f, 0f, -1.70f), -.70f, .94f);
            Wall("Left", new Vector3(-2.32f, 0f, -1.70f), new Vector3(-2.32f, 0f, 1.18f), -.70f, .94f);
            Wall("Rear right", new Vector3(2.32f, 0f, -1.70f), new Vector3(1.05f, 0f, -1.70f), -.70f, .94f);
            Wall("Rear left", new Vector3(-1.05f, 0f, -1.70f), new Vector3(-2.32f, 0f, -1.70f), -.70f, .94f);
            Wall("Passage right", new Vector3(1.05f, 0f, -1.70f), new Vector3(1.05f, 0f, -5.85f), -.70f, .94f);
            Wall("Passage left", new Vector3(-1.05f, 0f, -5.85f), new Vector3(-1.05f, 0f, -1.70f), -.70f, .94f);

            SandbagCourse(new Vector3(-2.25f, .83f, 1.18f), Vector3.right, 10, 2);
            SandbagCourse(new Vector3(2.32f, .97f, .83f), Vector3.back, 5, 1);
            SandbagCourse(new Vector3(-2.32f, .97f, -.98f), Vector3.forward, 5, 1);
            Berm();
            Duckboards();
            Crate(new Vector3(-1.62f, -.48f, -1.25f), new Vector3(.62f, .42f, .50f), -7f);
            Crate(new Vector3(-1.64f, -.04f, -1.26f), new Vector3(.58f, .34f, .46f), 4f);
            // A few spent cases beside the firing step, safely outside the player's lane.
            for (int i = 0; i < 13; i++)
            {
                var casing = Piece("Spent case", timberMesh, metal, new Vector3(R(1.42f, 1.87f), .027f, R(-.55f, .45f)),
                    new Vector3(.065f, .014f, .014f), Quaternion.Euler(0f, R(0f, 180f), 0f), false);
                casing.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            Debug.Log("[Sniper Ridge] 참호 생성 완료: 지형 굴착, 사격 발판, 목재 보강벽, 모래주머니, 후방 통로.");
        }

        GameObject Piece(string name, Mesh mesh, Material material, Vector3 position, Vector3 scale, Quaternion rotation, bool solid)
        {
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(transform, false);
            go.transform.localPosition = position; go.transform.localRotation = rotation; go.transform.localScale = scale;
            go.GetComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.GetComponent<MeshRenderer>(); renderer.sharedMaterial = material;
            var properties = new MaterialPropertyBlock();
            properties.SetColor("_Color", material.color * R(.90f, 1.07f)); renderer.SetPropertyBlock(properties);
            if (solid) { var collider = go.AddComponent<MeshCollider>(); collider.sharedMesh = mesh; }
            return go;
        }

        void Wall(string name, Vector3 a, Vector3 b, float bottom, float top)
        {
            Vector3 along = (b - a).normalized, normal = Vector3.Cross(along, Vector3.up);
            Quaternion rotation = Quaternion.LookRotation(normal);
            float length = Vector3.Distance(a, b);
            Vector3 middle = (a + b) * .5f;
            // A continuous packed-earth backing catches bullets between the visible timber courses.
            Piece(name + " packed earth", timberMesh, earth, middle + Vector3.up * ((bottom + top) * .5f),
                new Vector3(length + .12f, top - bottom, .34f), rotation, true);
            int courses = Mathf.CeilToInt((top - bottom - .08f) / .18f);
            for (int row = 0; row < courses; row++)
            {
                float y = bottom + .09f + row * .18f;
                Piece(name + " retaining plank", timberMesh, timber, middle - normal * .20f + Vector3.up * y,
                    new Vector3(length + R(-.05f, .07f), .165f, .055f), rotation * Quaternion.Euler(0f, 0f, R(-.5f, .5f)), false);
            }
            int posts = Mathf.CeilToInt(length / .78f);
            for (int i = 0; i <= posts; i++)
            {
                Vector3 p = Vector3.Lerp(a, b, i / (float)posts) - normal * .255f;
                Piece(name + " upright", timberMesh, timber, p + Vector3.up * ((bottom + top) * .5f),
                    new Vector3(top - bottom + .05f, .115f, .11f), rotation * Quaternion.Euler(0f, 0f, 90f), false);
                foreach (float y in new[] { bottom + .18f, top - .16f })
                    Piece("Iron retaining strap", timberMesh, metal, p - normal * .062f + Vector3.up * y,
                        new Vector3(.15f, .045f, .012f), rotation, false);
            }
        }

        void SandbagCourse(Vector3 start, Vector3 direction, int count, int rows)
        {
            Quaternion rotation = Quaternion.LookRotation(Vector3.Cross(direction, Vector3.up));
            for (int row = 0; row < rows; row++)
                for (int i = 0; i < count - row; i++)
                {
                    Vector3 position = start + direction * (i * .50f + row * .25f) + Vector3.up * (row * .22f + R(-.002f, .002f));
                    var bag = Piece("Stitched sandbag", bagMesh, canvas, position,
                        new Vector3(R(.56f, .60f), .20f, R(.38f, .42f)), rotation * Quaternion.Euler(0f, R(-4f, 4f), 0f), true);
                    var seam = bag.AddComponent<LineRenderer>();
                    seam.sharedMaterial = thread; seam.useWorldSpace = false; seam.loop = true;
                    seam.startWidth = seam.endWidth = .004f; seam.positionCount = 40;
                    seam.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                    for (int k = 0; k < 40; k++)
                    {
                        float t = k * Mathf.PI * 2f / 40;
                        // Superellipse follows the flattened stitched edge of the bag.
                        float x = Mathf.Sign(Mathf.Cos(t)) * Mathf.Pow(Mathf.Abs(Mathf.Cos(t)), .35f) * .492f;
                        float z = Mathf.Sign(Mathf.Sin(t)) * Mathf.Pow(Mathf.Abs(Mathf.Sin(t)), .35f) * .492f;
                        seam.SetPosition(k, new Vector3(x, -.015f, z));
                    }
                }
        }

        void Duckboards()
        {
            // Low packed fill supports the firing step; a real rear step drops into the deeper trench.
            Piece("Firing step earth", timberMesh, earth, new Vector3(0f, -.35f, -.02f), new Vector3(4.02f, .62f, 1.94f), Quaternion.identity, true);
            foreach (float x in new[] { -1.25f, 1.25f })
                Piece("Duckboard bearer", timberMesh, timber, new Vector3(x, -.08f, -.05f), new Vector3(.10f, .10f, 1.90f), Quaternion.identity, false);
            for (int i = 0; i < 10; i++)
                Piece("Firing duckboard", timberMesh, timber, new Vector3(0f, -.041f, -.85f + i * .185f),
                    new Vector3(R(3.84f, 3.94f), .082f, .166f), Quaternion.Euler(0f, R(-.45f, .45f), 0f), true);
            for (int i = 0; i < 2; i++)
                Piece("Step to communication trench", timberMesh, timber, new Vector3(0f, -.18f - i * .25f, -1.14f - i * .33f),
                    new Vector3(1.57f, .10f, .32f), Quaternion.identity, true);
            for (int i = 0; i < 23; i++)
                Piece("Passage duckboard", timberMesh, timber, new Vector3(0f, -TrenchTerrain.RearDrop - .04f, -1.84f - i * .174f),
                    new Vector3(R(1.34f, 1.46f), .08f, .15f), Quaternion.Euler(0f, R(-1.1f, 1.1f), 0f), true);
            // Damp drainage strips sit below the board level, with no bullet-blocking collider.
            foreach (float x in new[] { -.84f, .84f })
                Piece("Drainage channel", timberMesh, wetMud, new Vector3(x, -.68f, -3.75f), new Vector3(.16f, .012f, 3.9f), Quaternion.identity, false);
            for (int i = 0; i < 5; i++)
                Piece("Rear exit step", timberMesh, timber, new Vector3(0f, -.48f + i * .25f, -5.85f - i * .23f),
                    new Vector3(1.40f, .13f, .24f), Quaternion.identity, true);
        }

        void Crate(Vector3 centre, Vector3 size, float yaw)
        {
            Quaternion rotation = Quaternion.Euler(0f, yaw, 0f);
            Piece("Supply crate", timberMesh, timber, centre + Vector3.up * size.y * .5f, size, rotation, true);
            foreach (float side in new[] { -.35f, .35f })
                Piece("Crate reinforcing band", timberMesh, metal, centre + rotation * new Vector3(side * size.x, size.y * .5f, 0f),
                    new Vector3(.04f, size.y + .012f, size.z + .014f), rotation, false);
        }

        void Berm()
        {
            // Connect the front parapet to sampled, already excavated ground with an irregular soil apron.
            var vertices = new List<Vector3>(); var uv = new List<Vector2>(); var triangles = new List<int>();
            const int segments = 24;
            for (int row = 0; row < 3; row++)
                for (int i = 0; i <= segments; i++)
                {
                    float x = Mathf.Lerp(-2.70f, 2.70f, i / (float)segments);
                    float z = row == 0 ? 1.22f : row == 1 ? 1.78f : 2.70f;
                    float ground = TerrainGenerator.GroundHeight(terrain, transform.position.x + x, transform.position.z + z) - transform.position.y;
                    float edge = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(2.70f, 2.20f, Mathf.Abs(x)));
                    float mound = (row == 0 ? .93f : .99f) + .025f * Mathf.Sin(i * 2.7f + row);
                    float y = row == 2 ? ground + .012f : Mathf.Lerp(ground + .012f, mound, edge);
                    vertices.Add(new Vector3(x, y, z)); uv.Add(new Vector2(x, z));
                }
            for (int row = 0; row < 2; row++)
                for (int i = 0; i < segments; i++)
                {
                    int a = row * (segments + 1) + i, b = a + 1, c = a + segments + 1, d = c + 1;
                    triangles.Add(a); triangles.Add(c); triangles.Add(b); triangles.Add(b); triangles.Add(c); triangles.Add(d);
                }
            var mesh = Own(new Mesh { name = "Excavated soil parapet" });
            mesh.SetVertices(vertices); mesh.SetUVs(0, uv); mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds(); mesh.RecalculateTangents();
            Piece("Loose earth parapet", mesh, earth, Vector3.zero, Vector3.one, Quaternion.identity, true);
        }

        void OnDestroy()
        {
            foreach (var resource in generated) if (resource != null) Destroy(resource);
        }
    }
}
