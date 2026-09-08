using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;


namespace OriginalLauncherAssets
{
    [InitializeOnLoad]
    public static class LauncherPackBuilder
    {
        const string Root = "Assets/LauncherAssetPack";
        [Serializable] public class Part { public string name; public int mat; public float[] p, n, uv; }
        [Serializable] public class Level { public Part[] parts; }
        [Serializable] public class Collision { public string type; public float[] center, size; public float radius, height; }
        [Serializable] public class Model { public string name, label, category; public Level[] lods; public Collision collision; public Marker[] markers; }
        [Serializable] public class MaterialInfo { public string name, albedo, normal, metallicSmoothness, maskMap; public float[] color; public float metallic, roughness; public bool doubleSided; }
        [Serializable] public class MaterialFile { public MaterialInfo[] materials; }
        [Serializable] public class Instance { public string asset, name, district; public float[] position, scale; public float yaw; }
        [Serializable] public class Marker { public string name; public float[] position; }
        [Serializable] public class Layout { public string name; public Instance[] instances; public Marker[] markers; }
        static Vector3 V(float[] a, int i=0) { return new Vector3(a[i+2], a[i+1], a[i]); }
        static void Folder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent=Path.GetDirectoryName(path).Replace('\\','/'); Folder(parent);
            AssetDatabase.CreateFolder(parent,Path.GetFileName(path));
        }
        public const string Target = "Assets/Resources/Launchers";
        static readonly string[] Names = { "launcher_reusable", "launcher_compact", "launcher_heavy" };
        static bool building;

        static LauncherPackBuilder()
        {
            EditorApplication.delayCall += AutoBuild;
            EditorApplication.playModeStateChanged += state =>
            {
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
            if (building) return;
            foreach (string name in Names)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Target + "/Prefabs/" + name + ".prefab");
                if (prefab == null || prefab.GetComponentInChildren<MeshFilter>() == null ||
                    prefab.GetComponentInChildren<MeshFilter>().sharedMesh == null)
                { Build(); return; }
            }
        }

        [MenuItem("Sniper Ridge/로켓포 프리팹 생성 (Launcher Asset Pack)")]
        public static void Build()
        {
            if (building) return;
            building = true;
            try
            {
                foreach (string sub in new[] { "", "/Meshes", "/Materials", "/Prefabs" }) Folder(Target + sub);
                var file = JsonUtility.FromJson<MaterialFile>(File.ReadAllText(Root + "/Source/materials.json"));
                Material[] materials = MakeMaterials(file, Target);
                foreach (string name in Names)
                {
                    var model = JsonUtility.FromJson<Model>(File.ReadAllText(Root + "/Source/" + name + ".json"));
                    MakePrefab(model, materials, Target);
                }
                AssetDatabase.SaveAssets();
                Debug.Log("[Sniper Ridge] 로켓포 프리팹 3개 생성 완료: " + Target);
            }
            finally { building = false; }
        }

        // Preserve GUIDs when regenerating; never remove another weapon pack's output.
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
        public static Mesh MakeMesh(Level level,string name)
        {
            var vertices=new List<Vector3>();var normals=new List<Vector3>();var uvs=new List<Vector2>();var indices=new List<int[]>();
            foreach(Part p in level.parts)
            {
                if(p.p==null||p.n==null||p.uv==null||p.p.Length%9!=0||p.n.Length!=p.p.Length||p.uv.Length*3!=p.p.Length*2)throw new InvalidDataException("Invalid mesh: "+name);
                int count=p.p.Length/3,start=vertices.Count;int[] tris=new int[count];
                // Source faces are CCW. X/Z reflection produces Unity clockwise faces: retain indices.
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
            if(model.lods==null||model.lods.Length!=2)throw new InvalidDataException("Two LOD levels required: "+model.name);
            var root=new GameObject(model.name);
            try
            {
                var levels=new LOD[2];Mesh collisionMesh=null;
                for(int j=0;j<2;j++)
                {
                    var child=new GameObject("LOD"+j);child.transform.SetParent(root.transform,false);
                    var mesh=MakeMesh(model.lods[j],model.name+"_LOD"+j);mesh=SaveAsset(mesh,output+"/Meshes/"+mesh.name+".asset");
                    child.AddComponent<MeshFilter>().sharedMesh=mesh;var renderer=child.AddComponent<MeshRenderer>();
                    var slots=new Material[model.lods[j].parts.Length];for(int k=0;k<slots.Length;k++)slots[k]=materials[model.lods[j].parts[k].mat];renderer.sharedMaterials=slots;
                    renderer.shadowCastingMode=ShadowCastingMode.On;
                    float threshold=model.category=="terrain"?(j==0?.6f:0f):(j==0?.16f:.008f);
                    levels[j]=new LOD(threshold,new Renderer[]{renderer});if(j==0)collisionMesh=mesh;
                }
                var group=root.AddComponent<LODGroup>();group.SetLODs(levels);group.RecalculateBounds();
                foreach(var marker in model.markers)
                {
                    var point=new GameObject(marker.name);point.transform.SetParent(root.transform,false);point.transform.localPosition=V(marker.position);
                }
                if(model.collision.type=="box")
                {
                    var collider=root.AddComponent<BoxCollider>();collider.center=V(model.collision.center);
                    collider.size=new Vector3(model.collision.size[2],model.collision.size[1],model.collision.size[0]);collider.enabled=false;
                }
                else if(model.collision.type=="mesh"){var collider=root.AddComponent<MeshCollider>();collider.sharedMesh=collisionMesh;collider.convex=false;}
                else if(model.collision.type=="capsule"){var collider=root.AddComponent<CapsuleCollider>();collider.center=V(model.collision.center);collider.radius=model.collision.radius;collider.height=model.collision.height;collider.direction=1;}
                bool ok;var prefab=PrefabUtility.SaveAsPrefabAsset(root,output+"/Prefabs/"+model.name+".prefab",out ok);if(!ok)throw new IOException("Prefab save failed: "+model.name);return prefab;
            }
            finally{UnityEngine.Object.DestroyImmediate(root);}
        }
    }
    public sealed class LauncherBuildCheck : IPreprocessBuildWithReport
    {
        public int callbackOrder => -100;
        public void OnPreprocessBuild(BuildReport report) => LauncherPackBuilder.BuildIfMissing();
    }
}
