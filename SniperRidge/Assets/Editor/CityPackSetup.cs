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
    // Adapted from the repository's textured city pack. Does not create or replace scenes.
    [InitializeOnLoad]
    public static class CityPackSetup
    {
        const string Output = "Assets/Resources/CityPack";
        const string Revision = "military-town-1";
        static bool building;
        static string Source => Path.GetFullPath(Path.Combine(Application.dataPath,
            "../../city_fps_textured_v2/Unity/Assets/KoreanCityPackTextured"));
        [Serializable] public class Part { public string name; public int mat; public float[] p, n, uv; }
        [Serializable] public class CollisionBox { public string name; public float[] center, size; }
        [Serializable] public class Portal { public float[] center; public float width, height; }
        [Serializable] public class Model { public string name, label, category; public bool enterable; public Part[] parts; public CollisionBox[] colliders; public Portal[] portals; }
        [Serializable] public class MaterialInfo { public string name, albedo, normal, metallicSmoothness, maskMap; public float[] color; public float metallic, roughness; public bool atlas; }
        [Serializable] public class MaterialFile { public MaterialInfo[] materials; }

        static CityPackSetup() { EditorApplication.delayCall += AutoBuild; }
        static void AutoBuild()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            { EditorApplication.delayCall += AutoBuild; return; }
            try { BuildIfMissing(); }
            catch (Exception ex) { Debug.LogError("[Sniper Ridge] 도시 에셋 생성 실패: " + ex.Message); }
        }
        public static void BuildIfMissing()
        {
            if (building) return;
            bool ready = File.Exists(Output + "/revision.txt") && File.ReadAllText(Output + "/revision.txt") == Revision;
            foreach (string name in CityBattlefield.RequiredModels)
                ready &= AssetDatabase.LoadAssetAtPath<GameObject>(Output + "/Prefabs/" + name + ".prefab") != null;
            ready &= CityBattlefield.IsReady;
            if (!ready) Build();
        }
        [MenuItem("Sniper Ridge/도시 에셋 생성")]
        public static void Build()
        {
            if (building) return;
            if (!Directory.Exists(Source)) throw new DirectoryNotFoundException("저장소 전체를 받아 주세요: " + Source);
            building = true;
            try
            {
                textures.Clear();
                foreach (string folder in new[] { Output, Output + "/Meshes", Output + "/Materials", Output + "/Prefabs", Output + "/Textures" })
                    Directory.CreateDirectory(folder);
                AssetDatabase.Refresh();
                var file = JsonUtility.FromJson<MaterialFile>(File.ReadAllText(Source + "/Source/materials.json"));
                var materials = MakeMaterials(file, Output);
                var terrainShader = Shader.Find("Nature/Terrain/Diffuse");
                if (terrainShader == null) throw new InvalidOperationException("Built-in dry terrain shader missing");
                SaveAsset(new Material(terrainShader) { name="DryTerrain", enableInstancing=true }, Output+"/Materials/DryTerrain.mat");
                for (int i = 0; i < CityBattlefield.RequiredModels.Length; i++)
                {
                    string name = CityBattlefield.RequiredModels[i];
                    EditorUtility.DisplayProgressBar("Sniper Ridge 도시 에셋", name, (float)i / CityBattlefield.RequiredModels.Length);
                    string modelPath=name.StartsWith("town_")?"Assets/TownAssetPack/Source/"+name+".json":Source+"/Source/"+name+".json";
                    var model = JsonUtility.FromJson<Model>(File.ReadAllText(modelPath));
                    Validate(model, materials.Length);
                    BuildPrefab(model, materials, Output);
                }
                AssetDatabase.SaveAssets();
                File.WriteAllText(Output + "/revision.txt", Revision);
                AssetDatabase.Refresh();
                Debug.Log("[Sniper Ridge] 도시 에셋 생성 완료: PBR 건물·도로·엄폐물, 옥상 충돌체.");
            }
            finally { building = false; textures.Clear(); EditorUtility.ClearProgressBar(); }
        }
        static Vector3 ToUnity(float[] p, int i) { return new Vector3(p[i], p[i + 1], -p[i + 2]); }
        static readonly Dictionary<string, Texture2D> textures = new Dictionary<string, Texture2D>();
        static Texture2D LoadTexture(string relativePath, bool normalMap, bool srgb)
        {
            if (string.IsNullOrEmpty(relativePath)) return null;
            if (textures.TryGetValue(relativePath, out var cached)) return cached;
            string path = Output + "/Textures/" + Path.GetFileName(relativePath);
            File.Copy(Path.Combine(Source, relativePath), path, true);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.textureType = normalMap ? TextureImporterType.NormalMap : TextureImporterType.Default;
            importer.convertToNormalmap = false; importer.sRGBTexture = srgb;
            importer.alphaSource = TextureImporterAlphaSource.FromInput;
            importer.alphaIsTransparency = false;
            importer.wrapMode = relativePath.Contains("sign_atlas") ? TextureWrapMode.Clamp : TextureWrapMode.Repeat;
            importer.filterMode = FilterMode.Trilinear; importer.anisoLevel = 16;
            importer.maxTextureSize = 2048; importer.mipmapEnabled = true;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.SaveAndReimport();
            var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            if (texture == null) throw new FileNotFoundException(path);
            textures[relativePath] = texture;
            return texture;
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
        static void SetTexture(Material material, Texture2D texture, params string[] properties)
        {
            foreach (string property in properties)
                if (material.HasProperty(property)) material.SetTexture(property, texture);
        }
        static void SetFloat(Material material, string property, float value)
        {
            if (material.HasProperty(property)) material.SetFloat(property, value);
        }
        static Material[] MakeMaterials(MaterialFile file, string output)
        {
            var pipeline = GraphicsSettings.currentRenderPipeline;
            string shaderName = pipeline == null ? "Standard" : pipeline.GetType().Name.Contains("HDRender") ? "HDRP/Lit" : "Universal Render Pipeline/Lit";
            Shader shader = Shader.Find(shaderName);
            if (shader == null) throw new InvalidOperationException("Cannot find shader " + shaderName);
            Texture2D atlas = LoadTexture("Source/sign_atlas.png", false, true);
            var windows=UrbanSurfaceAssets.Windows();
            var result = new Material[file.materials.Length+3];
            for (int i = 0; i < file.materials.Length; i++)
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
                if (!string.IsNullOrEmpty(info.albedo))
                {
                    var albedo = LoadTexture(info.albedo, false, true);
                    var normal = LoadTexture(info.normal, true, false);
                    SetTexture(material, albedo, "_MainTex", "_BaseMap", "_BaseColorMap");
                    SetTexture(material, normal, "_BumpMap", "_NormalMap");
                    material.EnableKeyword("_NORMALMAP");
                    SetFloat(material, "_BumpScale", 1); SetFloat(material, "_NormalScale", 1);
                    if (shaderName == "HDRP/Lit")
                    {
                        SetTexture(material, LoadTexture(info.maskMap, false, false), "_MaskMap");
                        material.EnableKeyword("_MASKMAP");
                        material.EnableKeyword("_NORMALMAP_TANGENT_SPACE");
                        SetFloat(material, "_NormalMapSpace", 0);
                        SetFloat(material, "_MetallicRemapMin", 0); SetFloat(material, "_MetallicRemapMax", 1);
                        SetFloat(material, "_SmoothnessRemapMin", 0); SetFloat(material, "_SmoothnessRemapMax", 1);
                        SetFloat(material, "_AORemapMin", 0); SetFloat(material, "_AORemapMax", 1);
                    }
                    else
                    {
                        SetTexture(material, LoadTexture(info.metallicSmoothness, false, false), "_MetallicGlossMap");
                        material.EnableKeyword(shaderName == "Standard" ? "_METALLICGLOSSMAP" : "_METALLICSPECGLOSSMAP");
                        SetFloat(material, "_WorkflowMode", 1);
                        SetFloat(material, "_Smoothness", 1); SetFloat(material, "_GlossMapScale", 1);
                        SetFloat(material, "_SmoothnessTextureChannel", 0);
                    }
                }
                if(info.name=="Window_Glass" || info.name=="Window_Light")
                {
                    // Opaque exterior glazing: the closed building shell must not read as an open floor stack.
                    var tint=info.name=="Window_Glass" ? Color.white : new Color(1.12f,1.08f,.98f,1);
                    if(material.HasProperty("_Color"))material.SetColor("_Color",tint);
                    if(material.HasProperty("_BaseColor"))material.SetColor("_BaseColor",tint);
                    SetFloat(material,"_Metallic",0);SetFloat(material,"_Glossiness",.32f);SetFloat(material,"_Smoothness",.32f);
                    SetTexture(material,windows,"_MainTex","_BaseMap","_BaseColorMap");
                }
                if (info.name == "Asphalt" || info.name == "Sidewalk" || info.name == "Paver_Accent" ||
                    info.name == "White_Paint" || info.name == "Yellow_Paint") BattlefieldScenery.Dry(material);
                result[i] = SaveAsset(material, output + "/Materials/" + info.name + ".mat");
            }
            var stone=new Material(shader){name="AgedStone",enableInstancing=true};
            SetTexture(stone,UrbanSurfaceAssets.Stone(),"_MainTex","_BaseMap","_BaseColorMap");
            SetFloat(stone,"_Metallic",0);SetFloat(stone,"_Glossiness",.08f);SetFloat(stone,"_Smoothness",.08f);
            stone.mainTextureScale=Vector2.one;
            result[UrbanSurfaceAssets.StoneSlot]=SaveAsset(stone,output+"/Materials/AgedStone.mat");
            var canvas=new Material(shader){name="TownCanvas",color=new Color(.38f,.38f,.23f),enableInstancing=true};
            SetTexture(canvas,LoadTexture("Textures/PBR/concrete_albedo.jpg",false,true),"_MainTex","_BaseMap","_BaseColorMap");
            SetFloat(canvas,"_Metallic",0);SetFloat(canvas,"_Glossiness",.03f);SetFloat(canvas,"_Smoothness",.03f);
            result[25]=SaveAsset(canvas,output+"/Materials/TownCanvas.mat");
            var wall=new Material(shader){name="TownWall",color=new Color(.77f,.80f,.78f),enableInstancing=true};
            SetTexture(wall,UrbanSurfaceAssets.Plaster(),"_MainTex","_BaseMap","_BaseColorMap");
            SetTexture(wall,LoadTexture("Textures/PBR/concrete_normal_unity.png",true,false),"_BumpMap","_NormalMap");
            wall.EnableKeyword("_NORMALMAP");SetFloat(wall,"_BumpScale",.15f);SetFloat(wall,"_Glossiness",.04f);SetFloat(wall,"_Smoothness",.04f);SetFloat(wall,"_Metallic",0);
            result[26]=SaveAsset(wall,output+"/Materials/TownWall.mat");
            var road=UrbanSurfaceAssets.Asphalt();
            var asphalt=result[9];SetTexture(asphalt,road,"_MainTex","_BaseMap","_BaseColorMap");EditorUtility.SetDirty(asphalt);
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
                foreach (Part p in CityFacadeDetails.WithDetails(model))
                {
                    int start = vertices.Count; int count = p.p.Length / 3; int[] indices = new int[count];
                    for (int i = 0; i < count; i++)
                    {
                        vertices.Add(ToUnity(p.p, i * 3)); normals.Add(ToUnity(p.n, i * 3).normalized);
                        uv.Add(new Vector2(p.uv[i * 2], 1 - p.uv[i * 2 + 1])); indices[i] = start + i;
                    }
                    // Reflecting Z reverses the geometric normal. Reverse indices too so the
                    // Unity triangle normal agrees with the transformed outward source normal.
                    for(int i=0;i<count;i+=3){int swap=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=swap;}
                    triangles.Add(indices);slots.Add(materials[model.name.StartsWith("town_")&&model.category=="building"&&p.mat<=2?26:p.mat]);
                }
                var mesh = new Mesh { name = model.name, indexFormat = vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetUVs(0, uv); mesh.subMeshCount = triangles.Count;
                for (int i = 0; i < triangles.Count; i++) mesh.SetTriangles(triangles[i], i);
                mesh.RecalculateBounds(); mesh.RecalculateTangents();
                mesh = SaveAsset(mesh, output + "/Meshes/" + model.name + ".asset");
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
    public sealed class CityBuildPreflight : IPreprocessBuildWithReport
    {
        public int callbackOrder => 1;
        public void OnPreprocessBuild(BuildReport report) => CityPackSetup.BuildIfMissing();
    }
}
