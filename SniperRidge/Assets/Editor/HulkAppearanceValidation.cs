using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
namespace SniperRidge.EditorTools
{
    public static class HulkAppearanceValidation
    {
        public static void Before(){Render("hulk_surface_before",false);}
        public static void Run(){Render("hulk_surface_after",true);}
        static void Render(string name,bool validate)
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.ambientLight=new Color(.13f,.15f,.18f);
            QualitySettings.shadows=ShadowQuality.All;QualitySettings.shadowResolution=ShadowResolution.VeryHigh;QualitySettings.shadowDistance=30;
            Key("Key",new Vector3(35,-35,0),new Color(1,.91f,.78f),1.5f);
            Key("Fill",new Vector3(15,120,0),new Color(.67f,.79f,1),.65f);
            Key("Rim",new Vector3(30,180,0),new Color(1,.86f,.63f),1.2f);
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=Vector3.down*.10f;floor.transform.localScale=new Vector3(100,.2f,100);
            var mat=new Material(Shader.Find("Standard")){color=new Color(.115f,.13f,.15f)};mat.SetFloat("_Glossiness",.12f);floor.GetComponent<Renderer>().sharedMaterial=mat;
            for(int i=0;i<2;i++)
            {
                var root=new GameObject(i==0?"Front":"Back");root.transform.position=new Vector3(i==0?-1.30f:1.30f,0,0);
                root.transform.rotation=Quaternion.Euler(0,i==0?-12:165,0);var visual=HulkVisual.Create(root.transform);
                for(int frame=0;frame<60;frame++)visual.Pose(0,HulkController.Attack.None,0,true,false,-1,1f/60);
                foreach(var skin in visual.GetComponentsInChildren<SkinnedMeshRenderer>())
                {
                    if(validate)
                    {
                        if(skin.sharedMesh.uv.Length!=skin.sharedMesh.vertexCount)throw new Exception("Missing package UVs");
                        foreach(var material in skin.sharedMaterials)
                            if(!material || !material.mainTexture || !material.shader.isSupported || ShaderUtil.ShaderHasError(material.shader))throw new Exception("Package material/texture failure");
                    }
                }
            }
            var camera=new GameObject("Appearance camera").AddComponent<Camera>();camera.clearFlags=CameraClearFlags.SolidColor;
            camera.backgroundColor=new Color(.08f,.095f,.115f);camera.fieldOfView=34;camera.allowHDR=true;
            camera.transform.position=new Vector3(0,1.95f,9.2f);camera.transform.LookAt(new Vector3(0,1.66f,0));
            Save(camera,name,1920,1280);
            if(validate)
            {
                camera.transform.position=new Vector3(-.45f,2.75f,3.6f);camera.transform.LookAt(new Vector3(-1.30f,2.28f,0));camera.fieldOfView=33;
                Save(camera,"hulk_surface_detail",1440,1440);
                Debug.Log("[Hulk appearance] PASS: package meshes carry UVs; textured materials and shaders validated; gameplay prefab renders saved.");
            }
        }
        static void Key(string name,Vector3 rotation,Color color,float intensity)
        {var light=new GameObject(name).AddComponent<Light>();light.type=LightType.Directional;light.color=color;light.intensity=intensity;light.transform.rotation=Quaternion.Euler(rotation);light.shadows=LightShadows.Soft;light.shadowBias=.015f;light.shadowNormalBias=.08f;}
        static void Save(Camera camera,string name,int width,int height)
        {
            var target=new RenderTexture(width,height,24,RenderTextureFormat.ARGB32);target.antiAliasing=4;
            var texture=new Texture2D(width,height,TextureFormat.RGB24,false);var old=RenderTexture.active;
            try{camera.targetTexture=target;camera.Render();RenderTexture.active=target;texture.ReadPixels(new Rect(0,0,width,height),0,0);texture.Apply();Directory.CreateDirectory("Screenshots");File.WriteAllBytes("Screenshots/"+name+".png",texture.EncodeToPNG());}
            finally{camera.targetTexture=null;RenderTexture.active=old;UnityEngine.Object.DestroyImmediate(texture);UnityEngine.Object.DestroyImmediate(target);}
        }
    }
}
