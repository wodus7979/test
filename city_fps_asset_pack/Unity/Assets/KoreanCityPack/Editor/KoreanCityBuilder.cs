// Editor-only. Builds reusable native Unity meshes, materials, prefabs and a sample scene.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace OriginalKoreanCity
{
    public static class KoreanCityBuilder
    {
        const string Root = "Assets/KoreanCityPack";
        [Serializable] public class Part { public string name; public int mat; public float[] p, n, uv; }
        [Serializable] public class CollisionBox { public string name; public float[] center, size; }
        [Serializable] public class Portal { public float[] center; public float width, height; }
        [Serializable] public class Model { public string name, label, category; public bool enterable; public Part[] parts; public CollisionBox[] colliders; public Portal[] portals; }
        [Serializable] public class MaterialInfo { public string name; public float[] color; public float metallic, roughness; public bool atlas; }
        [Serializable] public class MaterialFile { public MaterialInfo[] materials; }
        [Serializable] public class Instance { public string asset, name, district; public float[] position, scale; public float yaw; }
        [Serializable] public class Marker { public string name; public float[] position; }
        [Serializable] public class Layout { public string name; public float[] size; public Instance[] instances; public Marker[] markers; }

        [MenuItem("Tools/Korean City Pack/Build Assets and Sample Scene")]
        public static void Build()
        {
            if (!Directory.Exists(Root + "/Source")) throw new DirectoryNotFoundException("Copy KoreanCityPack into Assets before building.");
            Layout layout = JsonUtility.FromJson<Layout>(File.ReadAllText(Root + "/Source/layout.json"));
            MaterialFile materialFile = JsonUtility.FromJson<MaterialFile>(File.ReadAllText(Root + "/Source/materials.json"));
            string output = AssetDatabase.GenerateUniqueAssetPath(Root + "/Generated");
            foreach (string sub in new[] { "", "/Materials", "/Meshes", "/Prefabs", "/Scenes" }) EnsureFolder(output + sub);
            Material[] materials = MakeMaterials(materialFile, output);
            Scene previous = SceneManager.GetActiveScene();
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            SceneManager.SetActiveScene(scene);
            bool saved = false;
            try
            {
                var prefabs = new Dictionary<string, GameObject>(StringComparer.Ordinal);
                string[] files = Directory.GetFiles(Root + "/Source", "*.json"); Array.Sort(files, StringComparer.Ordinal);
                for (int i = 0; i < files.Length; i++)
                {
                    if (Path.GetFileName(files[i]) == "layout.json" || Path.GetFileName(files[i]) == "materials.json") continue;
                    var model = JsonUtility.FromJson<Model>(File.ReadAllText(files[i]));
                    Validate(model, materials.Length);
                    EditorUtility.DisplayProgressBar("Korean City Pack", model.name, (float)i / files.Length);
                    prefabs[model.name] = BuildPrefab(model, materials, output);
                }
                var city = new GameObject(layout.name);
                var districts = new Dictionary<string, Transform>(StringComparer.Ordinal);
                foreach (Instance source in layout.instances)
                {
                    if (!prefabs.ContainsKey(source.asset)) throw new InvalidDataException("Missing asset: " + source.asset);
                    if (!districts.ContainsKey(source.district))
                    {
                        var district = new GameObject(source.district); district.transform.SetParent(city.transform, false);
                        districts[source.district] = district.transform;
                    }
                    var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefabs[source.asset], scene);
                    instance.name = source.name; instance.transform.SetParent(districts[source.district], false);
                    instance.transform.localPosition = ToUnity(source.position, 0);
                    instance.transform.localRotation = Quaternion.Euler(0, -source.yaw, 0);
                    instance.transform.localScale = new Vector3(source.scale[0], source.scale[1], source.scale[2]);
                }
                var markers = new GameObject("GameplayMarkers"); markers.transform.SetParent(city.transform, false);
                foreach (Marker m in layout.markers)
                {
                    var point = new GameObject(m.name); point.transform.SetParent(markers.transform, false);
                    point.transform.localPosition = ToUnity(m.position, 0);
                }
                var sunObject = new GameObject("Sun"); var sun = sunObject.AddComponent<Light>();
                sun.type = LightType.Directional; sun.color = new Color(1f, .96f, .88f); sun.intensity = 1.35f; sun.shadows = LightShadows.Soft;
                sunObject.transform.rotation = Quaternion.Euler(48, -35, 0);
                RenderSettings.sun = sun; RenderSettings.ambientMode = AmbientMode.Flat; RenderSettings.ambientLight = new Color(.48f, .55f, .62f);
                var cameraObject = new GameObject("OverviewCamera"); var camera = cameraObject.AddComponent<Camera>();
                cameraObject.tag = "MainCamera"; cameraObject.transform.position = new Vector3(142, 130, 168);
                cameraObject.transform.LookAt(new Vector3(0, 7, 0)); camera.nearClipPlane = .1f; camera.farClipPlane = 600; camera.fieldOfView = 52;
                camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = new Color(.24f, .33f, .41f);
                bool cityPrefabOK;
                PrefabUtility.SaveAsPrefabAsset(city, output + "/Prefabs/Korean_Mixed_District.prefab", out cityPrefabOK);
                if (!cityPrefabOK) throw new IOException("Failed to save complete city prefab.");
                string scenePath = output + "/Scenes/Korean_Mixed_District.unity";
                saved = EditorSceneManager.SaveScene(scene, scenePath);
                if (!saved) throw new IOException("Failed to save sample scene.");
                AssetDatabase.SaveAssets();
                Selection.activeObject = AssetDatabase.LoadAssetAtPath<SceneAsset>(scenePath);
                EditorGUIUtility.PingObject(Selection.activeObject);
                Debug.Log("Korean City Pack: " + prefabs.Count + " asset prefabs, " + layout.instances.Length + " placed instances, and sample scene saved to " + scenePath + ". Open that scene to view the district. Player controller and NavMesh are not included.");
            }
            finally
            {
                EditorUtility.ClearProgressBar();
                if (previous.IsValid() && previous.isLoaded) SceneManager.SetActiveScene(previous);
                // The generated scene is saved separately; existing open scenes are preserved.
                // If saving failed, leave the generated scene open for inspection and recovery.
                if (saved) EditorSceneManager.CloseScene(scene, true);
            }
        }

        static Vector3 ToUnity(float[] p, int i) { return new Vector3(p[i], p[i + 1], -p[i + 2]); }
        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent); AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }
        static Material[] MakeMaterials(MaterialFile file, string output)
        {
            var pipeline = GraphicsSettings.currentRenderPipeline;
            string shaderName = pipeline == null ? "Standard" : pipeline.GetType().Name.Contains("HDRender") ? "HDRP/Lit" : "Universal Render Pipeline/Lit";
            Shader shader = Shader.Find(shaderName);
            if (shader == null) throw new InvalidOperationException("Cannot find shader " + shaderName);
            string atlasPath = Root + "/Source/sign_atlas.png";
            var importer = AssetImporter.GetAtPath(atlasPath) as TextureImporter;
            if (importer != null)
            {
                importer.textureType = TextureImporterType.Default; importer.sRGBTexture = true;
                importer.wrapMode = TextureWrapMode.Clamp; importer.maxTextureSize = 2048; importer.mipmapEnabled = true;
                importer.SaveAndReimport();
            }
            Texture2D atlas = AssetDatabase.LoadAssetAtPath<Texture2D>(atlasPath);
            if (atlas == null) throw new FileNotFoundException("Sign atlas could not be imported: " + atlasPath);
            var result = new Material[file.materials.Length];
            for (int i = 0; i < result.Length; i++)
            {
                var info = file.materials[i]; var material = new Material(shader) { name = info.name, enableInstancing = true };
                var color = new Color(info.color[0], info.color[1], info.color[2]).gamma; color.a = 1;
                if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", color);
                if (material.HasProperty("_Color")) material.SetColor("_Color", color);
                if (material.HasProperty("_Metallic")) material.SetFloat("_Metallic", info.metallic);
                if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", 1 - info.roughness);
                if (material.HasProperty("_Glossiness")) material.SetFloat("_Glossiness", 1 - info.roughness);
                if (info.atlas)
                {
                    foreach (string property in new[] { "_BaseMap", "_BaseColorMap", "_MainTex" })
                        if (material.HasProperty(property)) material.SetTexture(property, atlas);
                }
                AssetDatabase.CreateAsset(material, output + "/Materials/" + info.name + ".mat"); result[i] = material;
            }
            return result;
        }
        static void Validate(Model model, int materialCount)
        {
            if (model == null || string.IsNullOrEmpty(model.name) || model.parts == null || model.parts.Length == 0) throw new InvalidDataException("Invalid city model source.");
            foreach (Part p in model.parts)
                if (p.p == null || p.n == null || p.uv == null || p.p.Length % 9 != 0 || p.n.Length != p.p.Length || p.uv.Length * 3 != p.p.Length * 2 || p.mat < 0 || p.mat >= materialCount)
                    throw new InvalidDataException("Invalid geometry in " + model.name + "/" + p.name);
        }
        static GameObject BuildPrefab(Model model, Material[] materials, string output)
        {
            var root = new GameObject(model.name);
            try
            {
                var vertices = new List<Vector3>(); var normals = new List<Vector3>(); var uv = new List<Vector2>();
                var triangles = new List<int[]>(); var slots = new List<Material>();
                foreach (Part p in model.parts)
                {
                    int start = vertices.Count; int count = p.p.Length / 3; int[] indices = new int[count];
                    for (int i = 0; i < count; i++)
                    {
                        vertices.Add(ToUnity(p.p, i * 3)); normals.Add(ToUnity(p.n, i * 3).normalized);
                        uv.Add(new Vector2(p.uv[i * 2], 1 - p.uv[i * 2 + 1])); indices[i] = start + i;
                    }
                    // Z reflection changes handedness, retaining the original indices for Unity's clockwise front faces.
                    triangles.Add(indices); slots.Add(materials[p.mat]);
                }
                var mesh = new Mesh { name = model.name, indexFormat = vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetUVs(0, uv); mesh.subMeshCount = triangles.Count;
                for (int i = 0; i < triangles.Count; i++) mesh.SetTriangles(triangles[i], i);
                mesh.RecalculateBounds(); mesh.RecalculateTangents();
                AssetDatabase.CreateAsset(mesh, output + "/Meshes/" + model.name + ".asset");
                root.AddComponent<MeshFilter>().sharedMesh = mesh; root.AddComponent<MeshRenderer>().sharedMaterials = slots.ToArray();
                // Geometry remains separated per asset, allowing renderer culling and prefab reuse.
                GameObjectUtility.SetStaticEditorFlags(root, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.OccluderStatic);
                var collisionRoot = new GameObject("Collision"); collisionRoot.transform.SetParent(root.transform, false);
                for (int i = 0; i < model.colliders.Length; i++)
                {
                    var source = model.colliders[i]; var child = new GameObject(source.name + "_" + i);
                    child.transform.SetParent(collisionRoot.transform, false);
                    var collider = child.AddComponent<BoxCollider>(); collider.center = ToUnity(source.center, 0);
                    collider.size = new Vector3(source.size[0], source.size[1], source.size[2]);
                }
                for (int i = 0; i < model.portals.Length; i++)
                {
                    var portal = new GameObject("OpenPortal_" + i); portal.transform.SetParent(root.transform, false);
                    portal.transform.localPosition = ToUnity(model.portals[i].center, 0);
                }
                bool ok; GameObject prefab = PrefabUtility.SaveAsPrefabAsset(root, output + "/Prefabs/" + model.name + ".prefab", out ok);
                if (!ok || prefab == null) throw new IOException("Cannot save prefab " + model.name);
                return prefab;
            }
            finally { UnityEngine.Object.DestroyImmediate(root); }
        }
    }
}
