using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;


namespace OriginalDoorGunAssets
{
    [InitializeOnLoad]
    public static class DoorGunPackBuilder
    {
        const string Root = "Assets/DoorGunAssetPack";
        [Serializable] public class Part { public string name; public int mat; public float[] p, n, uv; }
        [Serializable] public class Level { public Part[] parts; }
        [Serializable] public class Collision { public string type; public float[] center, size; public float radius, height; }
        [Serializable] public class ComponentData { public string name, parent; public float[] position; public Level[] lods; public Collision[] colliders; }
        [Serializable] public class Model { public string name, label; public ComponentData[] components; public Marker[] markers; }
        [Serializable] public class MaterialInfo { public string name, albedo, normal, metallicSmoothness, maskMap; public float[] color; public float metallic, roughness; public bool doubleSided; }
        [Serializable] public class MaterialFile { public MaterialInfo[] materials; }
        [Serializable] public class Instance { public string asset, name, district; public float[] position, scale; public float yaw; }
        [Serializable] public class Marker { public string name, parent; public float[] position; }
        [Serializable] public class Layout { public string name; public Instance[] instances; public Marker[] markers; }
        static Vector3 V(float[] a, int i=0) { return new Vector3(a[i], a[i+1], -a[i+2]); }
        static void Folder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent=Path.GetDirectoryName(path).Replace('\\','/'); Folder(parent);
            AssetDatabase.CreateFolder(parent,Path.GetFileName(path));
        }
        public const string Target = "Assets/Resources/DoorGun";
        static bool building;
        static DoorGunPackBuilder()
        {
            EditorApplication.delayCall += AutoBuild;
            EditorApplication.playModeStateChanged += state => {
                if (state == PlayModeStateChange.ExitingEditMode) BuildIfMissing();
            };
        }
        static void AutoBuild()
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            { EditorApplication.delayCall += AutoBuild; return; }
            if (!EditorApplication.isPlayingOrWillChangePlaymode) BuildIfMissing();
        }
        public static void BuildIfMissing()
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Target + "/Prefabs/door_gun_reference.prefab");
            if (prefab == null || prefab.GetComponentInChildren<MeshFilter>()?.sharedMesh == null) Build();
        }
        [MenuItem("Sniper Ridge/헬기 중기관총 에셋 생성")]
        public static void Build()
        {
            if (building) return;
            building = true;
            try
            {
                foreach (string sub in new[] { "", "/Meshes", "/Materials", "/Prefabs" }) Folder(Target + sub);
                var materials = JsonUtility.FromJson<MaterialFile>(File.ReadAllText(Root + "/Source/materials.json"));
                var model = JsonUtility.FromJson<Model>(File.ReadAllText(Root + "/Source/door_gun_reference.json"));
                MakePrefab(model, MakeMaterials(materials, Target), Target);
                AssetDatabase.SaveAssets();
                Debug.Log("[Sniper Ridge] 헬기 중기관총 에셋 생성 완료: " + Target);
            }
            finally { building = false; }
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
        static Texture2D LoadTexture(string relativePath, bool normalMap, bool srgb)
        {
            if (string.IsNullOrEmpty(relativePath)) return null;
            string path = Root + "/" + relativePath;
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null) throw new FileNotFoundException("Texture importer missing: " + path);
            importer.textureType = normalMap ? TextureImporterType.NormalMap : TextureImporterType.Default;
            importer.convertToNormalmap = false; importer.sRGBTexture = srgb;
            importer.alphaSource = TextureImporterAlphaSource.FromInput;
            importer.alphaIsTransparency = false; importer.wrapMode = TextureWrapMode.Repeat;
            importer.filterMode = FilterMode.Trilinear; importer.anisoLevel = 8;
            importer.maxTextureSize = 1024; importer.mipmapEnabled = true;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.SaveAndReimport();
            var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            if (texture == null) throw new FileNotFoundException("Texture could not be loaded: " + path);
            return texture;
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

        static Material[] MakeMaterials(MaterialFile file,string output)
        {
            var pipeline=GraphicsSettings.currentRenderPipeline;
            string shaderName=pipeline==null?"Standard":pipeline.GetType().Name.Contains("HDRender")?"HDRP/Lit":"Universal Render Pipeline/Lit";
            Shader shader=Shader.Find(shaderName);if(shader==null)throw new InvalidOperationException("Missing shader: "+shaderName);
            var result=new Material[file.materials.Length];
            for(int i=0;i<result.Length;i++)
            {
                var info=file.materials[i];var m=new Material(shader){name=info.name,enableInstancing=true};
                var color=new Color(info.color[0],info.color[1],info.color[2]).gamma;color.a=1;
                if(m.HasProperty("_BaseColor"))m.SetColor("_BaseColor",color);if(m.HasProperty("_Color"))m.SetColor("_Color",color);
                SetFloat(m,"_Metallic",info.metallic);SetFloat(m,"_Smoothness",1-info.roughness);SetFloat(m,"_Glossiness",1-info.roughness);
                if(!string.IsNullOrEmpty(info.albedo))
                {
                    SetTexture(m,LoadTexture(info.albedo,false,true),"_BaseMap","_BaseColorMap","_MainTex");
                    SetTexture(m,LoadTexture(info.normal,true,false),"_BumpMap","_NormalMap");m.EnableKeyword("_NORMALMAP");
                    SetFloat(m,"_BumpScale",1);SetFloat(m,"_NormalScale",1);
                    if(shaderName=="HDRP/Lit")
                    {
                        SetTexture(m,LoadTexture(info.maskMap,false,false),"_MaskMap");m.EnableKeyword("_MASKMAP");m.EnableKeyword("_NORMALMAP_TANGENT_SPACE");
                        SetFloat(m,"_NormalMapSpace",0);SetFloat(m,"_MetallicRemapMin",0);SetFloat(m,"_MetallicRemapMax",1);SetFloat(m,"_SmoothnessRemapMin",0);SetFloat(m,"_SmoothnessRemapMax",1);
                    }
                    else
                    {
                        SetTexture(m,LoadTexture(info.metallicSmoothness,false,false),"_MetallicGlossMap");m.EnableKeyword(shaderName=="Standard"?"_METALLICGLOSSMAP":"_METALLICSPECGLOSSMAP");
                        SetFloat(m,"_WorkflowMode",1);SetFloat(m,"_Smoothness",1);SetFloat(m,"_GlossMapScale",1);SetFloat(m,"_SmoothnessTextureChannel",0);
                    }
                }
                if(info.doubleSided)
                {
                    SetFloat(m,"_Cull",0);SetFloat(m,"_CullMode",0);SetFloat(m,"_CullModeForward",0);SetFloat(m,"_OpaqueCullMode",0);
                    SetFloat(m,"_DoubleSidedEnable",1);m.EnableKeyword("_DOUBLESIDED_ON");
                    if(m.HasProperty("_DoubleSidedConstants"))m.SetVector("_DoubleSidedConstants",new Vector4(-1,-1,-1,0));
                    m.doubleSidedGI=true;
                }
                result[i]=SaveAsset(m,output+"/Materials/"+info.name+".mat");
            }
            return result;
        }
        static Mesh MakeMesh(Level level,string name)
        {
            var vertices=new List<Vector3>();var normals=new List<Vector3>();var uvs=new List<Vector2>();var indices=new List<int[]>();
            foreach(Part p in level.parts)
            {
                if(p.p==null||p.n==null||p.uv==null||p.p.Length%9!=0||p.n.Length!=p.p.Length||p.uv.Length*3!=p.p.Length*2)throw new InvalidDataException("Invalid mesh: "+name);
                int count=p.p.Length/3,start=vertices.Count;int[] tris=new int[count];
                for(int i=0;i<count;i++){vertices.Add(V(p.p,i*3));normals.Add(V(p.n,i*3).normalized);uvs.Add(new Vector2(p.uv[i*2],1-p.uv[i*2+1]));tris[i]=start+i;}
                indices.Add(tris);
            }
            var mesh=new Mesh{name=name,indexFormat=vertices.Count>65535?IndexFormat.UInt32:IndexFormat.UInt16};
            mesh.SetVertices(vertices);mesh.SetNormals(normals);mesh.SetUVs(0,uvs);mesh.subMeshCount=indices.Count;
            for(int i=0;i<indices.Count;i++)mesh.SetTriangles(indices[i],i);
            mesh.RecalculateBounds();mesh.RecalculateTangents();return mesh;
        }
        static GameObject MakePrefab(Model model,Material[] materials,string output)
        {
            if(model.components==null||model.components.Length==0)throw new InvalidDataException("Missing door_gun components.");
            var root=new GameObject(model.name);
            try
            {
                var pivots=new Dictionary<string,Transform>();
                var lodRenderers=new[]{new List<Renderer>(),new List<Renderer>()};
                foreach(var component in model.components)
                {
                    var partRoot=new GameObject(component.name);partRoot.transform.SetParent(root.transform,false);pivots.Add(component.name,partRoot.transform);
                }
                foreach(var component in model.components)
                {
                    Transform pivot=pivots[component.name];
                    if(!string.IsNullOrEmpty(component.parent))pivot.SetParent(pivots[component.parent],false);
                    pivot.localPosition=V(component.position);
                    if(component.lods==null||component.lods.Length!=2)throw new InvalidDataException("Two LOD levels required: "+component.name);
                    for(int j=0;j<2;j++)
                    {
                        var child=new GameObject("LOD"+j);child.transform.SetParent(pivot,false);
                        var mesh=MakeMesh(component.lods[j],model.name+"_"+component.name+"_LOD"+j);
                        mesh=SaveAsset(mesh,output+"/Meshes/"+mesh.name+".asset");child.AddComponent<MeshFilter>().sharedMesh=mesh;
                        var renderer=child.AddComponent<MeshRenderer>();var slots=new Material[component.lods[j].parts.Length];
                        for(int k=0;k<slots.Length;k++)slots[k]=materials[component.lods[j].parts[k].mat];
                        renderer.sharedMaterials=slots;renderer.shadowCastingMode=ShadowCastingMode.On;lodRenderers[j].Add(renderer);
                    }
                    foreach(var box in component.colliders)
                    {
                        var collider=pivot.gameObject.AddComponent<BoxCollider>();collider.center=V(box.center);
                        collider.size=new Vector3(box.size[0],box.size[1],box.size[2]);
                    }
                }
                var group=root.AddComponent<LODGroup>();group.SetLODs(new[]{new LOD(.18f,lodRenderers[0].ToArray()),new LOD(.008f,lodRenderers[1].ToArray())});group.RecalculateBounds();
                foreach(var marker in model.markers)
                {
                    var point=new GameObject(marker.name);point.transform.SetParent(pivots[marker.parent],false);point.transform.localPosition=V(marker.position);
                }
                bool ok;var prefab=PrefabUtility.SaveAsPrefabAsset(root,output+"/Prefabs/"+model.name+".prefab",out ok);
                if(!ok)throw new IOException("Prefab save failed: "+model.name);return prefab;
            }
            finally{UnityEngine.Object.DestroyImmediate(root);}
        }
    }
    public sealed class DoorGunBuildCheck : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;
        public void OnPreprocessBuild(BuildReport report) => DoorGunPackBuilder.BuildIfMissing();
    }
}
