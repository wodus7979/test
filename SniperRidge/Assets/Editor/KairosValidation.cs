using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    public static class KairosValidation
    {
        static void Check(bool ok,string message){if(!ok)throw new Exception("Kairos: "+message);}
        public static void Run()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var actor=new GameObject("Kairos preview");var visual=HulkVisual.Create(actor.transform);
            var rig=visual.Model.GetComponent<KairosRig>();Check(rig&&rig.Ready,"appearance rig not connected");
            var target=rig.Character.GetComponentsInChildren<Transform>().ToDictionary(t=>t.name);
            var source=visual.MotionBones.ToDictionary(t=>t.name.Split(':').Last());
            float maxDirection=0;
            for(int f=0;f<120;f++)
            {
                visual.SetMotion(Vector3.forward*HulkController.WalkSpeed,0,0);
                visual.Pose(HulkController.WalkSpeed,HulkController.Attack.None,0,true,false,-1,1f/60);
                foreach(string side in new[]{"Left","Right"})foreach(var pair in new[]{new[]{"Arm","ForeArm"},new[]{"ForeArm","Hand"},new[]{"UpLeg","Leg"},new[]{"Leg","Foot"}})
                {
                    Vector3 a=source[side+pair[1]].position-source[side+pair[0]].position,b=target[side+pair[1]].position-target[side+pair[0]].position;
                    maxDirection=Mathf.Max(maxDirection,Vector3.Angle(a,b));
                }
                foreach(var skin in rig.Character.GetComponentsInChildren<SkinnedMeshRenderer>())
                {
                    Check(skin.sharedMaterial.shader.isSupported,"unsupported skin shader");
                    var mesh=new Mesh();skin.BakeMesh(mesh);
                    foreach(var v in mesh.vertices)Check(!float.IsNaN(v.x)&&!float.IsInfinity(v.y)&&v.sqrMagnitude<100,"unstable deformed mesh");
                    UnityEngine.Object.DestroyImmediate(mesh);
                }
            }
            Check(maxDirection<12,"limbs no longer follow the supplied motion: "+maxDirection);
            RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Flat;RenderSettings.ambientLight=new Color(.36f,.38f,.40f);RenderSettings.fog=false;
            var key=new GameObject("Studio key").AddComponent<Light>();key.type=LightType.Directional;key.intensity=1.25f;key.transform.rotation=Quaternion.Euler(35,-35,0);
            var fill=new GameObject("Studio fill").AddComponent<Light>();fill.type=LightType.Directional;fill.intensity=.6f;fill.transform.rotation=Quaternion.Euler(20,145,0);
            var camera=new GameObject("Preview camera").AddComponent<Camera>();camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.12f,.14f,.16f);camera.fieldOfView=34;camera.nearClipPlane=.03f;
            void Capture(string name,Vector3 position)
            {
                camera.transform.position=position;camera.transform.LookAt(Vector3.up*1.4f);
                var rt=new RenderTexture(900,1000,24);var image=new Texture2D(900,1000,TextureFormat.RGB24,false);var old=RenderTexture.active;
                camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,900,1000),0,0);image.Apply();Directory.CreateDirectory("Screenshots/kairos");File.WriteAllBytes("Screenshots/kairos/"+name+".png",image.EncodeToPNG());camera.targetTexture=null;RenderTexture.active=old;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);
            }
            visual.ResetLocomotion();visual.Pose(0,HulkController.Attack.None,0,true,false,-1,.2f);Capture("front",new Vector3(0,1.8f,6));Capture("back",new Vector3(0,1.8f,-6));
            visual.Pose(HulkController.WalkSpeed,HulkController.Attack.None,0,true,false,-1,.2f);Capture("run",new Vector3(3,1.8f,5));
            visual.Pose(0,HulkController.Attack.Punch,.32f,true,false,-1,.2f);Capture("punch",new Vector3(3,1.8f,5));
            // Preview the exact imported game asset in its authored A-pose as well.
            actor.SetActive(false);
            var rest=UnityEngine.Object.Instantiate(visual.Definition.Appearance);
            rest.transform.localScale=Vector3.one*(HulkController.Height/2.30f);
            Capture("asset_front",new Vector3(0,1.8f,6));Capture("asset_back",new Vector3(0,1.8f,-6));
            UnityEngine.Object.DestroyImmediate(rest);
            Debug.Log("[Kairos validation] PASS: textured appearance, stable skin deformation, native limb direction error="+maxDirection);
            UnityEngine.Object.DestroyImmediate(actor);
        }
    }
}
