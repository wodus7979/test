using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace OriginalNatureFPS
{
    public static class NatureFPSBuilder
    {
        const string Root = "Assets/NatureFPSPack";
        [Serializable] public class Part { public string name; public int mat; public float[] p, n, uv; }
        [Serializable] public class Level { public Part[] parts; }
        [Serializable] public class Collision { public string type; public float[] center; public float radius, height; }
        [Serializable] public class Model { public string name, label, category; public Level[] lods; public Collision collision; }
        [Serializable] public class MaterialInfo { public string name, albedo, normal, metallicSmoothness, maskMap; public float[] color; public float metallic, roughness; public bool doubleSided; }
        [Serializable] public class MaterialFile { public MaterialInfo[] materials; }
        [Serializable] public class Instance { public string asset, name, district; public float[] position, scale; public float yaw; }
        [Serializable] public class Marker { public string name; public float[] position; }
        [Serializable] public class Layout { public string name; public Instance[] instances; public Marker[] markers; }
        static Vector3 V(float[] a, int i=0) { return new Vector3(a[i], a[i+1], -a[i+2]); }
        static void Folder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent=Path.GetDirectoryName(path).Replace('\\','/'); Folder(parent);
            AssetDatabase.CreateFolder(parent,Path.GetFileName(path));
        }
        [MenuItem("Tools/Nature FPS Pack/Build Assets and Sample Scene")]
        public static void Build()
        {
            if (!Directory.Exists(Root+"/Source")) throw new DirectoryNotFoundException("Copy NatureFPSPack into Assets.");
            var layout=JsonUtility.FromJson<Layout>(File.ReadAllText(Root+"/Source/layout.json"));
            var materialFile=JsonUtility.FromJson<MaterialFile>(File.ReadAllText(Root+"/Source/materials.json"));
            string output=AssetDatabase.GenerateUniqueAssetPath(Root+"/Generated");
            foreach(string sub in new[]{"","/Meshes","/Materials","/Prefabs","/Scenes"}) Folder(output+sub);
            Material[] materials=MakeMaterials(materialFile,output);
            Scene previous=SceneManager.GetActiveScene();
            Scene scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Additive);
            SceneManager.SetActiveScene(scene);bool saved=false;
            try
            {
                var prefabs=new Dictionary<string,GameObject>();
                string[] files=Directory.GetFiles(Root+"/Source","*.json");Array.Sort(files);
                for(int i=0;i<files.Length;i++)
                {
                    string stem=Path.GetFileNameWithoutExtension(files[i]);if(stem=="layout"||stem=="materials")continue;
                    var model=JsonUtility.FromJson<Model>(File.ReadAllText(files[i]));
                    EditorUtility.DisplayProgressBar("Nature FPS Pack",model.name,(float)i/files.Length);
                    prefabs.Add(model.name,MakePrefab(model,materials,output));
                }
                var world=new GameObject(layout.name);var groups=new Dictionary<string,Transform>();
                foreach(var item in layout.instances)
                {
                    if(!groups.ContainsKey(item.district)){var g=new GameObject(item.district);g.transform.SetParent(world.transform,false);groups.Add(item.district,g.transform);}
                    var go=(GameObject)PrefabUtility.InstantiatePrefab(prefabs[item.asset],scene);go.name=item.name;go.transform.SetParent(groups[item.district],false);
                    go.transform.localPosition=V(item.position);go.transform.localRotation=Quaternion.Euler(0,-item.yaw,0);
                    go.transform.localScale=new Vector3(item.scale[0],item.scale[1],item.scale[2]);
                }
                foreach(var marker in layout.markers){var go=new GameObject(marker.name);go.transform.SetParent(world.transform,false);go.transform.localPosition=V(marker.position);}
                var sunObject=new GameObject("Sun");var sun=sunObject.AddComponent<Light>();sun.type=LightType.Directional;sun.intensity=1.2f;sun.color=new Color(1,.96f,.87f);sun.shadows=LightShadows.Soft;
                sunObject.transform.rotation=Quaternion.Euler(48,-35,0);RenderSettings.sun=sun;
                RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.ambientLight=new Color(.43f,.50f,.57f);
                var cameraObject=new GameObject("OverviewCamera");var camera=cameraObject.AddComponent<Camera>();cameraObject.tag="MainCamera";
                cameraObject.transform.position=new Vector3(150,125,185);cameraObject.transform.LookAt(new Vector3(0,24,-10));camera.nearClipPlane=.15f;camera.farClipPlane=700;camera.fieldOfView=53;
                camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.44f,.60f,.69f);
                bool ok;PrefabUtility.SaveAsPrefabAsset(world,output+"/Prefabs/Nature_Landscape.prefab",out ok);if(!ok)throw new IOException("Landscape prefab save failed.");
                string scenePath=output+"/Scenes/Nature_Landscape.unity";saved=EditorSceneManager.SaveScene(scene,scenePath);if(!saved)throw new IOException("Scene save failed.");
                AssetDatabase.SaveAssets();Selection.activeObject=AssetDatabase.LoadAssetAtPath<SceneAsset>(scenePath);EditorGUIUtility.PingObject(Selection.activeObject);
                Debug.Log("Nature FPS Pack: "+prefabs.Count+" prefabs and "+layout.instances.Length+" instances saved to "+scenePath+". Open the generated scene. FPS controller, NavMesh and wind are not included.");
            }
            finally
            {
                EditorUtility.ClearProgressBar();if(previous.IsValid()&&previous.isLoaded)SceneManager.SetActiveScene(previous);
                if(saved)EditorSceneManager.CloseScene(scene,true);
            }
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
                AssetDatabase.CreateAsset(m,output+"/Materials/"+info.name+".mat");result[i]=m;
            }
            return result;
        }
        static Mesh MakeMesh(Level level,string name)
        {
            var vertices=new List<Vector3>();var normals=new List<Vector3>();var uvs=new List<Vector2>();var indices=new List<int[]>();
            foreach(Part p in level.parts)
            {
                if(p.p==null||p.n==null||p.uv==null||p.p.Length%9!=0||p.n.Length!=p.p.Length||p.uv.Length*3!=p.p.Length*2)throw new InvalidDataException("Invalid mesh: "+name);
                int count=p.p.Length/3,start=vertices.Count;bool backfaces=GraphicsSettings.currentRenderPipeline==null && p.mat>=3;int[] tris=new int[count*(backfaces?2:1)];
                for(int i=0;i<count;i++){vertices.Add(V(p.p,i*3));normals.Add(V(p.n,i*3).normalized);uvs.Add(new Vector2(p.uv[i*2],1-p.uv[i*2+1]));tris[i]=start+i;}
                // Standard has no configurable cull mode; give geometric foliage explicit back faces.
                if(backfaces)for(int i=0;i<count;i++)
                {
                    int source=(i/3)*3+(i%3==1?2:i%3==2?1:0);
                    vertices.Add(V(p.p,source*3));normals.Add(-V(p.n,source*3).normalized);
                    uvs.Add(new Vector2(p.uv[source*2],1-p.uv[source*2+1]));tris[count+i]=start+count+i;
                }
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
                    var mesh=MakeMesh(model.lods[j],model.name+"_LOD"+j);AssetDatabase.CreateAsset(mesh,output+"/Meshes/"+mesh.name+".asset");
                    child.AddComponent<MeshFilter>().sharedMesh=mesh;var renderer=child.AddComponent<MeshRenderer>();
                    var slots=new Material[model.lods[j].parts.Length];for(int k=0;k<slots.Length;k++)slots[k]=materials[model.lods[j].parts[k].mat];renderer.sharedMaterials=slots;
                    renderer.shadowCastingMode=ShadowCastingMode.TwoSided;
                    float threshold=model.category=="terrain"?(j==0?.6f:0f):(j==0?.16f:.008f);
                    levels[j]=new LOD(threshold,new Renderer[]{renderer});if(j==0)collisionMesh=mesh;
                }
                var group=root.AddComponent<LODGroup>();group.SetLODs(levels);group.RecalculateBounds();
                if(model.collision.type=="mesh"){var collider=root.AddComponent<MeshCollider>();collider.sharedMesh=collisionMesh;collider.convex=false;}
                else if(model.collision.type=="capsule"){var collider=root.AddComponent<CapsuleCollider>();collider.center=V(model.collision.center);collider.radius=model.collision.radius;collider.height=model.collision.height;collider.direction=1;}
                bool ok;var prefab=PrefabUtility.SaveAsPrefabAsset(root,output+"/Prefabs/"+model.name+".prefab",out ok);if(!ok)throw new IOException("Prefab save failed: "+model.name);return prefab;
            }
            finally{UnityEngine.Object.DestroyImmediate(root);}
        }
    }
}
