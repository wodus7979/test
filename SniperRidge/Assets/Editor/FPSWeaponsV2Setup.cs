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
    // Adapted from the supplied FPSWeaponsV2Builder. Generates gameplay prefabs without opening a sample scene.
    [InitializeOnLoad]
    public static class FPSWeaponsV2Setup
    {
        const string Root="Assets/FPSWeaponsV2", Output="Assets/Resources/WeaponsV2", Revision="game-weapons-v2-1";
        [Serializable] public class Part { public string name; public int mat; public float[] p,n,uv; }
        [Serializable] public class Level { public Part[] parts; }
        [Serializable] public class ComponentData { public string name,parent; public float[] position; public Level[] lods; }
        [Serializable] public class Marker { public string name,parent; public float[] position; }
        [Serializable] public class Model { public string name; public ComponentData[] components; public Marker[] markers; }
        [Serializable] public class MaterialInfo { public string name,albedo,normal,metallicSmoothness,maskMap; public float[] color; public float metallic,roughness; public bool doubleSided; }
        [Serializable] public class MaterialFile { public MaterialInfo[] materials; }
        static readonly Dictionary<string,Texture2D> Textures=new Dictionary<string,Texture2D>();
        static Vector3 V(float[] p,int i=0)=>new Vector3(p[i],p[i+1],-p[i+2]);
        static FPSWeaponsV2Setup(){EditorApplication.delayCall+=AutoBuild;}
        static void AutoBuild()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)return;
            if(EditorApplication.isCompiling||EditorApplication.isUpdating){EditorApplication.delayCall+=AutoBuild;return;}
            try{BuildIfMissing();}catch(Exception e){Debug.LogError("[Sniper Ridge] V2 무기 생성 실패: "+e);}
        }
        static string Pipeline=>GraphicsSettings.currentRenderPipeline==null?"Standard":
            GraphicsSettings.currentRenderPipeline.GetType().Name.Contains("HDRender")?"HDRP/Lit":"Universal Render Pipeline/Lit";
        public static void BuildIfMissing()
        {
            bool ready=File.Exists(Output+"/revision.txt")&&File.ReadAllText(Output+"/revision.txt")==Revision+Pipeline;
            foreach(string name in WeaponModels.V2Names)ready&=AssetDatabase.LoadAssetAtPath<GameObject>(Output+"/Prefabs/"+name+".prefab")!=null;
            if(!ready)Build();
        }
        [MenuItem("Sniper Ridge/V2 무기 11종 생성")]
        public static void Build()
        {
            if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Play를 멈춘 뒤 생성하세요.");
            foreach(string sub in new[]{"","/Meshes","/Materials","/Prefabs"})Directory.CreateDirectory(Output+sub);
            AssetDatabase.Refresh();Textures.Clear();
            try
            {
                var file=JsonUtility.FromJson<MaterialFile>(File.ReadAllText(Root+"/Source/materials.json"));
                Material[] materials=MakeMaterials(file);
                for(int i=0;i<WeaponModels.V2Names.Length;i++)
                {
                    string name=WeaponModels.V2Names[i];EditorUtility.DisplayProgressBar("Sniper Ridge V2",name,i/(float)WeaponModels.V2Names.Length);
                    MakePrefab(JsonUtility.FromJson<Model>(File.ReadAllText(Root+"/Source/"+name+".json")),materials);
                }
                AssetDatabase.SaveAssets();File.WriteAllText(Output+"/revision.txt",Revision+Pipeline);AssetDatabase.Refresh();
                Debug.Log("[Sniper Ridge] V2 무기 11종 생성 완료. 플레이어·적·동료·헬기·로켓포·수류탄에 적용됩니다.");
            }
            finally{Textures.Clear();EditorUtility.ClearProgressBar();}
        }
        static T Save<T>(T value,string path) where T:UnityEngine.Object
        {
            var existing=AssetDatabase.LoadAssetAtPath<T>(path);
            if(existing==null){AssetDatabase.CreateAsset(value,path);return value;}
            EditorUtility.CopySerialized(value,existing);UnityEngine.Object.DestroyImmediate(value);EditorUtility.SetDirty(existing);return existing;
        }
        static Texture2D LoadTexture(string relative,bool normal,bool srgb)
        {
            if(string.IsNullOrEmpty(relative))return null;
            if(Textures.TryGetValue(relative,out var texture))return texture;
            string path=Root+"/"+relative;
            var importer=AssetImporter.GetAtPath(path) as TextureImporter;
            if(importer==null)throw new FileNotFoundException(path);
            importer.textureType=normal?TextureImporterType.NormalMap:TextureImporterType.Default;
            importer.convertToNormalmap=false;importer.sRGBTexture=srgb;importer.alphaSource=TextureImporterAlphaSource.FromInput;
            importer.alphaIsTransparency=false;importer.wrapMode=TextureWrapMode.Repeat;importer.filterMode=FilterMode.Trilinear;
            importer.anisoLevel=8;importer.maxTextureSize=2048;importer.mipmapEnabled=true;importer.textureCompression=TextureImporterCompression.CompressedHQ;
            importer.SaveAndReimport();texture=AssetDatabase.LoadAssetAtPath<Texture2D>(path);Textures.Add(relative,texture);return texture;
        }
        static void Texture(Material m,Texture2D texture,params string[] names)
        {foreach(string name in names)if(m.HasProperty(name))m.SetTexture(name,texture);}
        static void Float(Material m,string name,float value){if(m.HasProperty(name))m.SetFloat(name,value);}
        static Material[] MakeMaterials(MaterialFile file)
        {
            Shader shader=Shader.Find(Pipeline);if(shader==null)throw new InvalidOperationException("Missing shader: "+Pipeline);
            var result=new Material[file.materials.Length];
            for(int i=0;i<result.Length;i++)
            {
                var info=file.materials[i];var m=new Material(shader){name=info.name,enableInstancing=true};
                Color color=new Color(info.color[0],info.color[1],info.color[2]).gamma;
                if(m.HasProperty("_Color"))m.SetColor("_Color",color);if(m.HasProperty("_BaseColor"))m.SetColor("_BaseColor",color);
                Float(m,"_Metallic",info.metallic);Float(m,"_Glossiness",1-info.roughness);Float(m,"_Smoothness",1-info.roughness);
                if(!string.IsNullOrEmpty(info.albedo))
                {
                    Texture(m,LoadTexture(info.albedo,false,true),"_MainTex","_BaseMap","_BaseColorMap");
                    Texture(m,LoadTexture(info.normal,true,false),"_BumpMap","_NormalMap");m.EnableKeyword("_NORMALMAP");
                    if(Pipeline=="HDRP/Lit")
                    {
                        Texture(m,LoadTexture(info.maskMap,false,false),"_MaskMap");m.EnableKeyword("_MASKMAP");m.EnableKeyword("_NORMALMAP_TANGENT_SPACE");
                    }
                    else
                    {
                        Texture(m,LoadTexture(info.metallicSmoothness,false,false),"_MetallicGlossMap");
                        m.EnableKeyword(Pipeline=="Standard"?"_METALLICGLOSSMAP":"_METALLICSPECGLOSSMAP");
                        Float(m,"_GlossMapScale",1);Float(m,"_Smoothness",1);Float(m,"_WorkflowMode",1);Float(m,"_SmoothnessTextureChannel",0);
                    }
                }
                if(info.doubleSided){Float(m,"_Cull",0);Float(m,"_CullMode",0);m.doubleSidedGI=true;}
                result[i]=Save(m,Output+"/Materials/"+info.name+".mat");
            }
            return result;
        }
        public static Mesh MakeMesh(Level level,string name)
        {
            var vertices=new List<Vector3>();var normals=new List<Vector3>();var uv=new List<Vector2>();var indices=new List<int[]>();
            foreach(var part in level.parts)
            {
                if(part.p.Length%9!=0||part.n.Length!=part.p.Length||part.uv.Length*3!=part.p.Length*2)throw new InvalidDataException(name);
                int count=part.p.Length/3,start=vertices.Count;var triangles=new int[count];
                for(int i=0;i<count;i++)
                {
                    vertices.Add(V(part.p,i*3));normals.Add(V(part.n,i*3).normalized);uv.Add(new Vector2(part.uv[i*2],1-part.uv[i*2+1]));
                    // Z reflection reverses handedness; reverse triangle winding with it.
                    triangles[i]=start+(i/3)*3+(i%3==1?2:i%3==2?1:0);
                }
                indices.Add(triangles);
            }
            var mesh=new Mesh{name=name,indexFormat=vertices.Count>65535?IndexFormat.UInt32:IndexFormat.UInt16};
            mesh.SetVertices(vertices);mesh.SetNormals(normals);mesh.SetUVs(0,uv);mesh.subMeshCount=indices.Count;
            for(int i=0;i<indices.Count;i++)mesh.SetTriangles(indices[i],i);
            mesh.RecalculateBounds();mesh.RecalculateTangents();return mesh;
        }
        static void MakePrefab(Model model,Material[] materials)
        {
            var root=new GameObject(model.name);
            try
            {
                var pivots=new Dictionary<string,Transform>();var renderers=new[]{new List<Renderer>(),new List<Renderer>()};
                foreach(var c in model.components){var t=new GameObject(c.name).transform;t.SetParent(root.transform,false);pivots.Add(c.name,t);}
                foreach(var c in model.components)
                {
                    var pivot=pivots[c.name];if(!string.IsNullOrEmpty(c.parent))pivot.SetParent(pivots[c.parent],false);pivot.localPosition=V(c.position);
                    if(c.lods.Length!=2)throw new InvalidDataException("Two LODs required: "+model.name);
                    for(int l=0;l<2;l++)
                    {
                        var child=new GameObject("LOD"+l,typeof(MeshFilter),typeof(MeshRenderer));child.transform.SetParent(pivot,false);
                        string name=model.name+"_"+c.name+"_LOD"+l;
                        child.GetComponent<MeshFilter>().sharedMesh=Save(MakeMesh(c.lods[l],name),Output+"/Meshes/"+name+".asset");
                        var slots=new Material[c.lods[l].parts.Length];for(int s=0;s<slots.Length;s++)slots[s]=materials[c.lods[l].parts[s].mat];
                        var renderer=child.GetComponent<MeshRenderer>();renderer.sharedMaterials=slots;renderers[l].Add(renderer);
                    }
                }
                foreach(var marker in model.markers)Point(pivots[marker.parent],marker.name,V(marker.position));
                if(model.name=="mounted_machine_gun")
                {
                    Point(pivots["Weapon"],"RearGripLeft",new Vector3(-.225f,.065f,-.55f));
                    Point(pivots["Weapon"],"RearGripRight",new Vector3(.225f,.065f,-.55f));
                }
                else if(model.name=="grenade_olive")Point(root.transform,"EffectOrigin",new Vector3(0,.045f,0));
                else if(!model.name.StartsWith("launcher_"))
                {
                    WeaponGrip(model.name,out Vector3 right,out Vector3 left);
                    Point(pivots["Body"],"RightHand",right);Point(pivots["Body"],"LeftHand",left);
                }
                var group=root.AddComponent<LODGroup>();group.SetLODs(new[]{new LOD(.18f,renderers[0].ToArray()),new LOD(.008f,renderers[1].ToArray())});group.RecalculateBounds();
                PrefabUtility.SaveAsPrefabAsset(root,Output+"/Prefabs/"+model.name+".prefab",out bool ok);
                if(!ok)throw new IOException("Prefab save failed: "+model.name);
            }
            finally{UnityEngine.Object.DestroyImmediate(root);}
        }
        static void Point(Transform parent,string name,Vector3 position)
        {var t=new GameObject(name).transform;t.SetParent(parent,false);t.localPosition=position;}
        static void WeaponGrip(string name,out Vector3 right,out Vector3 left)
        {
            switch(name)
            {
                case "01_precision_rifle":right=new Vector3(0,-.047f,-.207f);left=new Vector3(0,.013f,.08f);break;
                case "02_light_machine_gun":right=new Vector3(0,-.035f,-.211f);left=new Vector3(0,.013f,.065f);break;
                case "04_submachine_gun":right=new Vector3(0,-.044f,-.142f);left=new Vector3(0,.035f,.14f);break;
                case "05_pump_shotgun":right=new Vector3(0,.015f,-.245f);left=new Vector3(0,.025f,.16f);break;
                case "06_service_pistol":right=new Vector3(0,-.018f,-.057f);left=new Vector3(-.033f,-.018f,-.045f);break;
                default:right=new Vector3(0,-.050f,-.172f);left=new Vector3(0,-.05f,.175f);break;
            }
        }
    }
    public sealed class FPSWeaponsV2BuildPreflight:IPreprocessBuildWithReport
    {public int callbackOrder=>20;public void OnPreprocessBuild(BuildReport report)=>FPSWeaponsV2Setup.BuildIfMissing();}
}
