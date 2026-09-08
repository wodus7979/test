// Original exterior prop assets. Editor-only: no runtime dependency.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace OriginalFirearmAssets
{
    public static class FirearmPackBuilder
    {
        const string Root = "Assets/FirearmAssetPack";
        [Serializable] public class SourceModel { public string name; public SourcePart[] parts; }
        [Serializable] public class SourcePart { public string name; public int mat; public float[] p, n, uv; }
        static readonly string[] Names = { "Graphite_coated_metal", "Machined_steel", "Black_polymer", "Rubber", "Earth_cerakote", "Recess_dark", "Optical_glass", "Markings", "Olive_polymer" };
        static readonly Color[] Colors = {
            new Color(.075f,.088f,.098f), new Color(.27f,.29f,.31f), new Color(.033f,.038f,.041f),
            new Color(.016f,.019f,.021f), new Color(.30f,.25f,.18f), new Color(.008f,.011f,.014f),
            new Color(.023f,.16f,.19f), new Color(.53f,.55f,.52f), new Color(.17f,.19f,.125f) };
        static readonly float[] Metals = { .78f,.92f,.05f,0,.48f,.2f,.75f,.1f,.05f };
        static readonly float[] Roughness = { .29f,.23f,.73f,.91f,.48f,.65f,.09f,.6f,.68f };

        // Sniper Ridge: 런타임에서 Resources.Load 로 불러 쓰도록 고정 경로에 생성한다.
        public const string Target = "Assets/Resources/Weapons";

        [MenuItem("Sniper Ridge/총기 프리팹 생성 (Firearm Asset Pack)")]
        public static void Build() { Build(true); }

        /// <summary>프리팹이 아직 없으면 생성한다 (프로젝트를 열 때 자동 호출).</summary>
        public static void BuildIfMissing()
        {
            if (!AssetDatabase.IsValidFolder(Root + "/Source")) return;
            string[] sources = Directory.GetFiles(Root + "/Source", "*.json");
            bool missing = false;
            foreach (string path in sources)
                if (!File.Exists(Target + "/Prefabs/" + Path.GetFileNameWithoutExtension(path) + ".prefab")) { missing = true; break; }
            if (missing && sources.Length > 0) Build(false);
        }

        public static void Build(bool force)
        {
            string[] sources = Directory.GetFiles(Root + "/Source", "*.json");
            Array.Sort(sources, StringComparer.Ordinal);
            if (sources.Length == 0) throw new InvalidOperationException("No source geometry found in " + Root + "/Source");
            string target = Target;
            EnsureFolder(target); EnsureFolder(target + "/Materials"); EnsureFolder(target + "/Meshes"); EnsureFolder(target + "/Prefabs");
            Material[] materials = MakeMaterials(target);
            int completed = 0;
            try
            {
                foreach (string path in sources)
                {
                    string prefabPath = target + "/Prefabs/" + Path.GetFileNameWithoutExtension(path) + ".prefab";
                    if (!force && File.Exists(prefabPath)) continue;
                    SourceModel source = JsonUtility.FromJson<SourceModel>(File.ReadAllText(path));
                    if (source == null || source.parts == null || source.parts.Length == 0)
                        throw new InvalidDataException("Invalid model source: " + path);
                    EditorUtility.DisplayProgressBar("Firearm Asset Pack", source.name, (float)completed / sources.Length);
                    BuildModel(source, materials, target);
                    completed++;
                }
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
                Debug.Log("[Sniper Ridge] 총기 프리팹 " + completed + "개 생성: " + target + "/Prefabs (단위 m, 총구 방향 +Z)");
            }
            finally { EditorUtility.ClearProgressBar(); }
        }

        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent); AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        static Material[] MakeMaterials(string target)
        {
            var pipeline = GraphicsSettings.currentRenderPipeline;
            string shaderName = pipeline == null ? "Standard" :
                pipeline.GetType().Name.IndexOf("HDRender", StringComparison.OrdinalIgnoreCase) >= 0 ? "HDRP/Lit" : "Universal Render Pipeline/Lit";
            Shader shader = Shader.Find(shaderName);
            if (shader == null) throw new InvalidOperationException("Required shader not found: " + shaderName);
            var result = new Material[Names.Length];
            for (int i = 0; i < Names.Length; i++)
            {
                string matPath = target + "/Materials/" + Names[i] + ".mat";
                var existing = AssetDatabase.LoadAssetAtPath<Material>(matPath);
                if (existing != null) { result[i] = existing; continue; }
                var mat = new Material(shader) { name = Names[i], enableInstancing = true };
                // Source colors are linear glTF factors. Unity material color fields are sRGB.
                Color color = Colors[i].gamma; color.a = 1;
                if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
                if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
                if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", Metals[i]);
                if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 1 - Roughness[i]);
                if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", 1 - Roughness[i]);
                AssetDatabase.CreateAsset(mat, matPath);
                result[i] = mat;
            }
            return result;
        }

        static string Group(string name)
        {
            if (name.StartsWith("magazine")) return "Magazine";
            if (name.StartsWith("ammunition_box") || name.StartsWith("box_")) return "AmmoBox";
            if (name.StartsWith("scope") || name.StartsWith("ocular") || name.StartsWith("objective") ||
                name.StartsWith("optic_") || name.Contains("turret")) return "Optic";
            if (name.StartsWith("stock") || name.StartsWith("recoil") || name.StartsWith("cheek") || name.StartsWith("adjustable_stock")) return "Stock";
            if (name.StartsWith("bipod")) return "Bipod";
            if (name.StartsWith("pump")) return "Pump";
            if (name == "slide" || name.StartsWith("slide_rear") || name.StartsWith("slide_front")) return "Slide";
            return "Body";
        }

        // Reflect and permute axes: source +X forward / +Y up -> Unity +Z forward / +Y up.
        // Reflection reverses handedness while retaining the source triangle order for Unity.
        static Vector3 Convert(float[] v, int i) { return new Vector3(v[i + 2], v[i + 1], v[i]); }

        static void BuildModel(SourceModel source, Material[] materials, string target)
        {
            var groups = new SortedDictionary<string, List<SourcePart>>(StringComparer.Ordinal);
            foreach (SourcePart part in source.parts)
            {
                if (part.p == null || part.n == null || part.uv == null || part.p.Length % 9 != 0 ||
                    part.n.Length != part.p.Length || part.uv.Length * 3 != part.p.Length * 2 || part.mat < 0 || part.mat >= materials.Length)
                    throw new InvalidDataException("Invalid mesh data in " + source.name + ": " + part.name);
                string group = Group(part.name);
                if (!groups.ContainsKey(group)) groups[group] = new List<SourcePart>();
                groups[group].Add(part);
            }
            var root = new GameObject(source.name);
            Bounds fullBounds = new Bounds(); bool hasBounds = false;
            try
            {
                foreach (var entry in groups)
                {
                    var vertices = new List<Vector3>(); var normals = new List<Vector3>(); var uvs = new List<Vector2>();
                    var triangles = new SortedDictionary<int, List<int>>();
                    foreach (SourcePart p in entry.Value)
                    {
                        if (!triangles.ContainsKey(p.mat)) triangles[p.mat] = new List<int>();
                        int start = vertices.Count;
                        for (int i = 0; i < p.p.Length; i += 3)
                        {
                            Vector3 v = Convert(p.p, i); vertices.Add(v); normals.Add(Convert(p.n, i).normalized);
                            int uvIndex = i / 3 * 2; uvs.Add(new Vector2(p.uv[uvIndex], p.uv[uvIndex + 1]));
                            if (!hasBounds) { fullBounds = new Bounds(v, Vector3.zero); hasBounds = true; } else fullBounds.Encapsulate(v);
                        }
                        // X<->Z 교환은 반사 변환이라 감김 방향이 뒤집힌다. 삼각형마다 순서를 되돌려 바깥면을 유지한다.
                        for (int i = 0; i < p.p.Length / 3; i += 3)
                        {
                            var t = triangles[p.mat];
                            t.Add(start + i); t.Add(start + i + 2); t.Add(start + i + 1);
                        }
                    }
                    Bounds groupBounds = new Bounds(vertices[0], Vector3.zero);
                    foreach (Vector3 v in vertices) groupBounds.Encapsulate(v);
                    Vector3 pivot = groupBounds.center;
                    for (int i = 0; i < vertices.Count; i++) vertices[i] -= pivot;
                    var mesh = new Mesh { name = source.name + "_" + entry.Key, indexFormat = vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                    mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetUVs(0, uvs); mesh.subMeshCount = triangles.Count;
                    var slots = new List<Material>(); int submesh = 0;
                    foreach (var faces in triangles) { mesh.SetTriangles(faces.Value, submesh++); slots.Add(materials[faces.Key]); }
                    mesh.RecalculateBounds(); mesh.RecalculateTangents();
                    string meshPath = target + "/Meshes/" + mesh.name + ".asset";
                    if (AssetDatabase.LoadAssetAtPath<Mesh>(meshPath) != null) AssetDatabase.DeleteAsset(meshPath);
                    AssetDatabase.CreateAsset(mesh, meshPath);
                    var child = new GameObject(entry.Key); child.transform.SetParent(root.transform, false); child.transform.localPosition = pivot;
                    child.AddComponent<MeshFilter>().sharedMesh = mesh;
                    child.AddComponent<MeshRenderer>().sharedMaterials = slots.ToArray();
                }
                var collider = root.AddComponent<BoxCollider>(); collider.center = fullBounds.center; collider.size = fullBounds.size;
                float barrelY = source.name.StartsWith("06") ? .077f : (source.name.StartsWith("02") || source.name.StartsWith("04") ? .065f : .06f);
                var muzzle = new GameObject("Muzzle"); muzzle.transform.SetParent(root.transform, false); muzzle.transform.localPosition = new Vector3(0, barrelY, fullBounds.max.z);
                bool success;
                PrefabUtility.SaveAsPrefabAsset(root, target + "/Prefabs/" + source.name + ".prefab", out success);
                if (!success) throw new IOException("Could not save prefab: " + source.name);
            }
            finally { UnityEngine.Object.DestroyImmediate(root); }
        }
    }
}
