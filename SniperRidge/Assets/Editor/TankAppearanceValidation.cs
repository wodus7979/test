using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SniperRidge.EditorTools
{
    public static class TankAppearanceValidation
    {
        [MenuItem("Sniper Ridge/전차 재질 검사 및 비교 렌더")]
        public static void Validate()
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Stop Play before appearance validation.");
            var shader=Resources.Load<Shader>("Shaders/TankSurface");
            if(shader==null || !shader.isSupported || ShaderUtil.ShaderHasError(shader))
                throw new InvalidOperationException("Tank surface shader failed to compile.");
            var scene=EditorSceneManager.NewPreviewScene();
            GameObject tank=null;
            Material floorMaterial=null;
            try
            {
                var floor=GameObject.CreatePrimitive(PrimitiveType.Plane);
                SceneManager.MoveGameObjectToScene(floor,scene);
                floor.transform.localScale=Vector3.one*8;
                floorMaterial=new Material(Shader.Find("Standard")){color=new Color(.57f,.61f,.65f)};
                floorMaterial.SetFloat("_Glossiness",.08f);floor.GetComponent<Renderer>().sharedMaterial=floorMaterial;
                AddLight(scene,"Sun",Quaternion.Euler(42,-35,0),new Color(1,.93f,.83f),1.3f,true);
                AddLight(scene,"Sky fill",Quaternion.Euler(28,145,0),new Color(.64f,.77f,1),.75f,false);
                var camera=new GameObject("Tank inspection camera").AddComponent<Camera>();
                SceneManager.MoveGameObjectToScene(camera.gameObject,scene);camera.scene=scene;
                camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.19f,.24f,.30f);
                camera.transform.position=new Vector3(9,5.4f,12);camera.transform.LookAt(new Vector3(0,1.3f,0));
                camera.fieldOfView=42;camera.nearClipPlane=.1f;camera.farClipPlane=100;
                camera.allowHDR=true;
                foreach(string resource in new[]{TankVehicle.Resource,TankVehicle.OppositionResource})
                {
                    tank=UnityEngine.Object.Instantiate(Resources.Load<GameObject>(resource));
                    SceneManager.MoveGameObjectToScene(tank,scene);tank.GetComponent<LODGroup>().ForceLOD(0);
                    string tag=resource==TankVehicle.Resource?"k2":"opposition";
                    var block=new MaterialPropertyBlock();block.SetColor("_Color",new Color(.38f,.43f,.27f));
                    block.SetTexture("_MainTex",Texture2D.whiteTexture);
                    foreach(var r in tank.GetComponentsInChildren<MeshRenderer>())
                        for(int i=0;i<r.sharedMaterials.Length;i++)r.SetPropertyBlock(block,i);
                    Capture(camera,"tank_"+tag+"_before");
                    int colliders=tank.GetComponentsInChildren<Collider>().Length;
                    tank.AddComponent<TankVehicle>();
                    var detail=tank.AddComponent<TankAppearanceDetail>();detail.Initialize(new Color(.38f,.43f,.27f));
                    if(tank.GetComponentsInChildren<Collider>().Length!=colliders)throw new Exception("Appearance changed collision geometry.");
                    bool rubber=false,paint=false,optics=false;
                    foreach(var r in tank.GetComponentsInChildren<MeshRenderer>())
                    foreach(var m in r.sharedMaterials)
                    {
                        if(m.shader!=shader)throw new Exception("Tank material not converted.");
                        if(m.name.Contains("Rubber")){rubber=true;if(m.GetFloat("_Metallic")!=0)throw new Exception("Rubber is metallic.");}
                        if(m.GetFloat("_Paint")>0){paint=true;if(m.GetFloat("_Metallic")>.15f)throw new Exception("Paint behaves as bare metal.");}
                        if(m.name.Contains("Optic")){optics=true;if(m.GetFloat("_Glossiness")<.7f)throw new Exception("Optics are matte.");}
                    }
                    if(!rubber||!paint||!optics)throw new Exception("Tank surface groups missing.");
                    var tracks=tank.GetComponent<TankTrackDetail>();
                    if (tracks!=null)
                    {
                        var mesh=tank.transform.Find("Moving steel track shoes").GetComponent<MeshFilter>().sharedMesh;
                        if(mesh.vertexCount!=72*2*24)throw new Exception("Track shoes missing.");
                        var tick=typeof(TankTrackDetail).GetMethod("LateUpdate",BindingFlags.Instance|BindingFlags.NonPublic);
                        var elapsed=typeof(TankTrackDetail).GetField("elapsed",BindingFlags.Instance|BindingFlags.NonPublic);
                        float original=mesh.vertices[0].z;
                        tank.transform.position=Vector3.forward*.05f;elapsed.SetValue(tracks,1f);tick.Invoke(tracks,null);
                        if(mesh.vertices[0].z<=original)throw new Exception("Forward tread rotation is reversed.");
                        tank.transform.position=Vector3.zero;elapsed.SetValue(tracks,1f);tick.Invoke(tracks,null);
                        if(Mathf.Abs(mesh.vertices[0].z-original)>.001f)throw new Exception("Reverse tread rotation failed.");
                    }
                    Capture(camera,"tank_"+tag+"_after");
                    detail.Burn();Capture(camera,"tank_"+tag+"_wreck");
                    UnityEngine.Object.DestroyImmediate(tank);tank=null;
                }
                Debug.Log("[Sniper Ridge] 전차 재질 검사 통과: 두 전차·도장·비금속 고무·관측창·충돌 유지·파괴 재질·궤도 전후진. Screenshots/tank_* 비교 렌더 저장.");
            }
            finally
            {
                if(tank!=null)UnityEngine.Object.DestroyImmediate(tank);
                EditorSceneManager.ClosePreviewScene(scene);
                if(floorMaterial!=null)UnityEngine.Object.DestroyImmediate(floorMaterial);
            }
        }
        static void AddLight(Scene scene,string name,Quaternion rotation,Color color,float intensity,bool shadows)
        {
            var light=new GameObject(name).AddComponent<Light>();SceneManager.MoveGameObjectToScene(light.gameObject,scene);
            light.type=LightType.Directional;light.transform.rotation=rotation;light.color=color;light.intensity=intensity;
            light.shadows=shadows?LightShadows.Soft:LightShadows.None;
        }
        public static void Capture(Camera camera,string tag)
        {
            var previous=RenderTexture.active;
            var previousTarget=camera.targetTexture;
            var target=RenderTexture.GetTemporary(1600,1000,24,RenderTextureFormat.ARGB32);
            var image=new Texture2D(1600,1000,TextureFormat.RGB24,false);
            try
            {
                camera.targetTexture=target;camera.Render();RenderTexture.active=target;
                image.ReadPixels(new Rect(0,0,1600,1000),0,0);image.Apply();
                Directory.CreateDirectory("Screenshots");File.WriteAllBytes("Screenshots/"+tag+".png",image.EncodeToPNG());
            }
            finally
            {
                camera.targetTexture=previousTarget;RenderTexture.active=previous;RenderTexture.ReleaseTemporary(target);
                UnityEngine.Object.DestroyImmediate(image);
            }
        }
    }
}
