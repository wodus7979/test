using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Reusable bevelled timber and sagging cloth meshes, with explicit outward normals.</summary>
    public static class TrenchGeometry
    {
        public static Mesh RoundedBox(int subdivisions, float radius, bool cloth)
        {
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uv = new List<Vector2>();
            var indices = new List<int>();
            foreach (Vector3 normal in new[] { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back })
            {
                Vector3 u = Vector3.Cross(Mathf.Abs(normal.y) > .5f ? Vector3.forward : Vector3.up, normal).normalized;
                Vector3 v = Vector3.Cross(normal, u);
                int start = vertices.Count;
                for (int y = 0; y <= subdivisions; y++)
                    for (int x = 0; x <= subdivisions; x++)
                    {
                        float su = x / (float)subdivisions - .5f, sv = y / (float)subdivisions - .5f;
                        Vector3 q = normal * .5f + u * su + v * sv;
                        float limit = .5f - radius;
                        Vector3 core = new Vector3(Mathf.Clamp(q.x, -limit, limit), Mathf.Clamp(q.y, -limit, limit), Mathf.Clamp(q.z, -limit, limit));
                        Vector3 n = (q - core).normalized;
                        Vector3 point = core + n * radius;
                        if (cloth)
                        {
                            // The perturbation depends on position, so adjoining faces stay watertight.
                            float fold = Mathf.Sin(q.x * 31f + q.z * 13f) * Mathf.Sin(q.y * 17f + q.z * 23f);
                            point += n * (.012f * fold);
                            point.y -= .035f * (1f - 4f * q.x * q.x) * (1f - 4f * q.z * q.z);
                        }
                        vertices.Add(point); normals.Add(n); uv.Add(new Vector2(su + .5f, sv + .5f));
                    }
                for (int y = 0; y < subdivisions; y++)
                    for (int x = 0; x < subdivisions; x++)
                    {
                        int a = start + y * (subdivisions + 1) + x, b = a + 1, c = a + subdivisions + 1, d = c + 1;
                        indices.Add(a); indices.Add(b); indices.Add(c);
                        indices.Add(b); indices.Add(d); indices.Add(c);
                    }
            }
            var mesh = new Mesh { name = cloth ? "Woven sagging sandbag" : "Bevelled trench timber" };
            mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetUVs(0, uv); mesh.SetTriangles(indices, 0);
            mesh.RecalculateBounds(); mesh.RecalculateTangents();
            return mesh;
        }

        public static Texture2D SurfaceTexture(bool cloth)
        {
            const int size = 128;
            var texture = new Texture2D(size, size, TextureFormat.RGB24, true) { name = cloth ? "Burlap weave" : "Weathered timber grain" };
            texture.wrapMode = TextureWrapMode.Repeat;
            texture.anisoLevel = 4;
            var pixels = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float noise = Mathf.PerlinNoise(x * .14f + 17f, y * .13f + 9f);
                    float value;
                    if (cloth)
                    {
                        float warp = .5f + .5f * Mathf.Sin(x * Mathf.PI * .5f);
                        float weft = .5f + .5f * Mathf.Sin(y * Mathf.PI * .5f);
                        value = .66f + noise * .16f + .12f * warp + .06f * weft;
                    }
                    else
                    {
                        float grain = Mathf.PerlinNoise(x * .017f, y * .24f);
                        float split = Mathf.Pow(Mathf.Abs(Mathf.Sin(y * .82f + grain * 7f)), 16f);
                        value = .42f + .37f * grain + .12f * noise - .18f * split;
                    }
                    pixels[y * size + x] = new Color(value, value * .94f, value * .84f);
                }
            texture.SetPixels(pixels); texture.Apply(true, true);
            return texture;
        }
    }
}
