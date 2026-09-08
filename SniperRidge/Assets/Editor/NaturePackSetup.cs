using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge.EditorTools
{
    // Source data stays in the repository asset pack; only generated Unity assets enter a player build.
    [InitializeOnLoad]
    public static class NaturePackSetup
    {
        const string Output = "Assets/Resources/NaturePack";
        const string Revision = "pc-nature-1";
        static readonly string[] Names = { "pine_1", "pine_2", "broadleaf_1", "broadleaf_2", "bush", "boulder_1", "boulder_2", "grass_short", "grass_tall" };
        static string Source => Path.GetFullPath(Path.Combine(Application.dataPath, "../../nature_fps_asset_pack/Unity/Assets/NatureFPSPack"));
        [Serializable] public class Part { public int mat; public float[] p, n, uv; }
        [Serializable] public class Level { public Part[] parts; }
        [Serializable] public class Model { public string name; public Level[] lods; }
        [Serializable] public class MaterialInfo { public string name, albedo, normal, metallicSmoothness; public float[] color; public float metallic, roughness; public bool doubleSided; }
        [Serializable] public class MaterialFile { public MaterialInfo[] materials; }

        static NaturePackSetup() { EditorApplication.delayCall += AutoBuild; }

        static void AutoBuild()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                EditorApplication.delayCall += AutoBuild;
                return;
            }
            try { BuildIfMissing(); }
            catch (Exception ex) { Debug.LogWarning("[Sniper Ridge] 자연 에셋 생성 실패: " + ex.Message); }
        }

        public static void BuildIfMissing()
        {
            bool ready = File.Exists(Output + "/revision.txt") && File.ReadAllText(Output + "/revision.txt") == Revision;
            foreach (string name in Names)
                ready &= AssetDatabase.LoadAssetAtPath<GameObject>(Output + "/Prefabs/" + name + ".prefab") != null;
            if (!ready) Build();
        }

        [MenuItem("Sniper Ridge/고품질 자연 에셋 생성")]
        public static void Build()
        {
            if (!Directory.Exists(Source)) throw new DirectoryNotFoundException("저장소 전체를 받아 주세요. 자연 팩 경로: " + Source);
            var standard = Shader.Find("Standard");
            var foliage = Shader.Find("SniperRidge/Foliage");
            if (standard == null || foliage == null) throw new InvalidOperationException("자연 에셋 셰이더가 아직 준비되지 않았습니다.");
            foreach (string folder in new[] { Output, Output + "/Meshes", Output + "/Materials", Output + "/Prefabs", Output + "/Textures" })
                Directory.CreateDirectory(folder);
            AssetDatabase.Refresh();
            var file = JsonUtility.FromJson<MaterialFile>(File.ReadAllText(Source + "/Source/materials.json"));
            var materials = new Material[file.materials.Length];
            for (int i = 0; i < materials.Length; i++)
            {
                var info = file.materials[i];
                var mat = new Material(info.doubleSided ? foliage : standard) { name = info.name, enableInstancing = true };
                mat.color = new Color(info.color[0], info.color[1], info.color[2]).gamma;
                mat.SetFloat("_Glossiness", 1f - info.roughness);
                mat.SetFloat("_Metallic", info.metallic);
                if (!string.IsNullOrEmpty(info.albedo))
                {
                    mat.mainTexture = ImportTexture(info.albedo, false, true);
                    mat.SetTexture("_BumpMap", ImportTexture(info.normal, true, false));
                    mat.EnableKeyword("_NORMALMAP");
                    mat.SetTexture("_MetallicGlossMap", ImportTexture(info.metallicSmoothness, false, false));
                    mat.EnableKeyword("_METALLICGLOSSMAP");
                    mat.SetFloat("_GlossMapScale", 1f);
                }
                materials[i] = SaveAsset(mat, Output + "/Materials/" + info.name + ".mat");
            }
            try
            {
                for (int i = 0; i < Names.Length; i++)
                {
                    EditorUtility.DisplayProgressBar("Sniper Ridge", Names[i], (float)i / Names.Length);
                    var model = JsonUtility.FromJson<Model>(File.ReadAllText(Source + "/Source/" + Names[i] + ".json"));
                    var root = new GameObject(model.name);
                    try
                    {
                        var lods = new LOD[2];
                        for (int l = 0; l < 2; l++)
                        {
                            var child = new GameObject("LOD" + l);
                            child.transform.SetParent(root.transform, false);
                            var mesh = SaveAsset(MakeMesh(model.lods[l], model.name + "_LOD" + l), Output + "/Meshes/" + model.name + "_LOD" + l + ".asset");
                            child.AddComponent<MeshFilter>().sharedMesh = mesh;
                            var renderer = child.AddComponent<MeshRenderer>();
                            var slots = new Material[model.lods[l].parts.Length];
                            for (int s = 0; s < slots.Length; s++) slots[s] = materials[model.lods[l].parts[s].mat];
                            renderer.sharedMaterials = slots;
                            renderer.shadowCastingMode = ShadowCastingMode.TwoSided;
                            lods[l] = new LOD(l == 0 ? .22f : .012f, new Renderer[] { renderer });
                        }
                        var group = root.AddComponent<LODGroup>();
                        group.SetLODs(lods);
                        group.RecalculateBounds();
                        // Gameplay colliders are attached by the runtime adapter, never to leaves.
                        PrefabUtility.SaveAsPrefabAsset(root, Output + "/Prefabs/" + model.name + ".prefab");
                    }
                    finally { UnityEngine.Object.DestroyImmediate(root); }
                }
                AssetDatabase.SaveAssets();
                File.WriteAllText(Output + "/revision.txt", Revision);
                AssetDatabase.Refresh();
                Debug.Log("[Sniper Ridge] 고품질 자연 프리팹 9개 생성 완료 (2 LOD, PBR, 잎 바람).");
            }
            finally { EditorUtility.ClearProgressBar(); }
        }

        static T SaveAsset<T>(T value, string path) where T : UnityEngine.Object
        {
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing == null) { AssetDatabase.CreateAsset(value, path); return value; }
            EditorUtility.CopySerialized(value, existing);
            UnityEngine.Object.DestroyImmediate(value);
            EditorUtility.SetDirty(existing);
            return existing;
        }

        static Texture2D ImportTexture(string relative, bool normal, bool srgb)
        {
            string path = Output + "/Textures/" + Path.GetFileName(relative);
            File.Copy(Path.Combine(Source, relative), path, true);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
            importer.convertToNormalmap = false;
            importer.sRGBTexture = srgb;
            importer.mipmapEnabled = true;
            importer.wrapMode = TextureWrapMode.Repeat;
            importer.filterMode = FilterMode.Trilinear;
            importer.anisoLevel = 16;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        static Vector3 Convert(float[] a, int i) => new Vector3(a[i], a[i + 1], -a[i + 2]);
        static Mesh MakeMesh(Level level, string name)
        {
            var vertices = new List<Vector3>();
            var normals = new List<Vector3>();
            var uv = new List<Vector2>();
            var triangles = new List<int[]>();
            foreach (var part in level.parts)
            {
                if (part.p.Length % 9 != 0 || part.n.Length != part.p.Length || part.uv.Length * 3 != part.p.Length * 2)
                    throw new InvalidDataException("Invalid nature mesh: " + name);
                int start = vertices.Count, count = part.p.Length / 3;
                var indices = new int[count];
                for (int i = 0; i < count; i++)
                {
                    vertices.Add(Convert(part.p, i * 3));
                    normals.Add(Convert(part.n, i * 3).normalized);
                    uv.Add(new Vector2(part.uv[i * 2], 1f - part.uv[i * 2 + 1]));
                    // Reflecting Z changes handedness: reverse each triangle with the transformed normals.
                    indices[i] = start + (i / 3) * 3 + (i % 3 == 1 ? 2 : i % 3 == 2 ? 1 : 0);
                }
                triangles.Add(indices);
            }
            var mesh = new Mesh { name = name, indexFormat = vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
            mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetUVs(0, uv);
            mesh.subMeshCount = triangles.Count;
            for (int i = 0; i < triangles.Count; i++) mesh.SetTriangles(triangles[i], i);
            mesh.RecalculateBounds(); mesh.RecalculateTangents();
            return mesh;
        }
    }

    public class NatureBuildPreflight : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;
        public void OnPreprocessBuild(BuildReport report) => NaturePackSetup.BuildIfMissing();
    }
}
