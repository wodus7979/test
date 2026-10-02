using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace SniperRidge.EditorTools
{
    /// <summary>Deterministic pose/foot-contact checks in an isolated Unity project.</summary>
    public static class HulkGaitValidation
    {
        static void Check(bool value,string message){if(!value)throw new Exception("Hulk gait: "+message);}
        static float Flex(Transform hip,Transform knee,Transform ankle)
            =>Vector3.Angle(knee.position-hip.position,ankle.position-knee.position);
        public static void Run()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.ambientLight=new Color(.62f,.66f,.72f);
            var light=new GameObject("Soft key").AddComponent<Light>();light.type=LightType.Directional;
            light.intensity=1.15f;light.transform.rotation=Quaternion.Euler(45,-35,0);light.shadows=LightShadows.Soft;
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.name="Contact floor";
            floor.transform.position=Vector3.down*.1f;floor.transform.localScale=new Vector3(200,.2f,200);
            floor.GetComponent<Renderer>().sharedMaterial=new Material(Shader.Find("Standard")){color=new Color(.29f,.32f,.36f)};
            var root=new GameObject("Gait subject");var visual=HulkVisual.Create(root.transform);
            var bones=visual.GetComponentsInChildren<SkinnedMeshRenderer>()[0].bones;
            Transform Bone(string name)=>bones.First(b=>b.name==name);
            var hip=Bone("Hips");var thigh=Bone("LeftThigh");var calf=Bone("LeftCalf");var foot=Bone("LeftFoot");
            var phaseField=typeof(HulkVisual).GetField("gaitPhase",BindingFlags.Instance|BindingFlags.NonPublic);
            var camera=new GameObject("Gait camera").AddComponent<Camera>();camera.fieldOfView=38;
            camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.17f,.20f,.25f);
            Directory.CreateDirectory("Screenshots");Directory.CreateDirectory("Logs");
            string report="";
            foreach(int rate in new[]{30,60,120})foreach(var direction in new[]{Vector3.forward,Vector3.back,Vector3.right})
            {
                root.transform.SetPositionAndRotation(Vector3.zero,Quaternion.identity);visual.ResetLocomotion();
                float dt=1f/rate,minKnee=180,maxKnee=0,minHip=100,maxHip=0,maxSlide=0;
                float previousPhase=-1;Vector3 previousFoot=Vector3.zero;int contactSamples=0,capture=0;
                float upperLength=Vector3.Distance(thigh.position,calf.position),lowerLength=Vector3.Distance(calf.position,foot.position);
                for(int i=0;i<rate*5;i++)
                {
                    root.transform.position+=direction*HulkController.WalkSpeed*dt;
                    visual.SetMotion(direction*HulkController.WalkSpeed,0,0);
                    visual.Pose(HulkController.WalkSpeed,HulkController.Attack.None,0,true,false,-1,dt);
                    float phase=Mathf.Repeat((float)phaseField.GetValue(visual),1);
                    if(i>rate)
                    {
                        float knee=Flex(thigh,calf,foot);minKnee=Mathf.Min(minKnee,knee);maxKnee=Mathf.Max(maxKnee,knee);
                        minHip=Mathf.Min(minHip,hip.position.y);maxHip=Mathf.Max(maxHip,hip.position.y);
                        Check(Vector3.Dot(hip.up,Vector3.up)>.98f,"pelvis wobbles excessively");
                        Check(Mathf.Abs(Vector3.Distance(thigh.position,calf.position)-upperLength)<.001f&&Mathf.Abs(Vector3.Distance(calf.position,foot.position)-lowerLength)<.001f,"leg stretches");
                        if(phase>.14f&&phase<.40f&&previousPhase>.14f&&previousPhase<phase)
                        {maxSlide=Mathf.Max(maxSlide,Vector3.Distance(previousFoot,foot.position));contactSamples++;}
                        Check(foot.position.y>.16f,"ankle sinks into floor");
                        if(rate==30&&direction==Vector3.forward&&i>rate*2&&capture<8&&Mathf.FloorToInt(phase*8)==capture)
                        {Capture(camera,visual,root.transform,"hulk_gait_"+capture,false);capture++;}
                    }
                    previousPhase=phase;previousFoot=foot.position;
                }
                Check(contactSamples>20,"not enough mid-stance samples");
                Check(maxSlide<.015f,"planted foot slides "+maxSlide+" at "+rate+"fps "+direction);
                Check(minKnee<32&&maxKnee>55,"knee does not extend and flex: "+minKnee+" / "+maxKnee);
                Check(maxHip-minHip<.12f,"pelvis bounces too far");
                report+=$"{rate}fps {direction}: knee={minKnee:F1}..{maxKnee:F1}, hip travel={maxHip-minHip:F3}m, stance slip/frame={maxSlide:F4}m\n";
                int steps=visual.FootstepSerial;
                for(int i=0;i<rate;i++){visual.SetMotion(Vector3.zero,0,0);visual.Pose(0,HulkController.Attack.None,0,true,false,-1,dt);}
                Check(visual.FootstepSerial==steps,"footsteps continue after stop");
                Check(visual.Motion=="Idle","idle not restored");
                if(rate==60&&direction==Vector3.forward)Capture(camera,visual,root.transform,"hulk_balanced_back",true);
            }
            Debug.Log("[Hulk gait] PASS\n"+report);File.WriteAllText("Logs/hulk-gait-result.txt","PASS\n"+report);
        }
        static void Capture(Camera camera,HulkVisual visual,Transform root,string name,bool rear)
        {
            camera.transform.position=root.position+(rear?new Vector3(3.8f,2.3f,-6):new Vector3(5.5f,2.4f,5.5f));
            camera.transform.LookAt(root.position+Vector3.up*1.55f);
            var skins=visual.GetComponentsInChildren<SkinnedMeshRenderer>();var mesh=new Mesh();skins[0].BakeMesh(mesh);
            // BakeMesh(false) returns renderer-local vertices. Check the actual sole as
            // well as the bones: a bad skin binding can pass joint-only assertions.
            var weights=skins[0].sharedMesh.boneWeights;var vertices=mesh.vertices;
            float sole=float.PositiveInfinity;
            for(int i=0;i<vertices.Length;i++)
                if(weights[i].weight0>.8f&&skins[0].bones[weights[i].boneIndex0].name.EndsWith("Foot"))
                    sole=Mathf.Min(sole,skins[0].transform.TransformPoint(vertices[i]).y-root.position.y);
            Check(sole>-.04f&&sole<.06f,"rendered sole not grounded: "+sole);
            Debug.Log(name+" rendered sole height="+sole.ToString("F3"));
            var baked=new GameObject("Pose render",typeof(MeshFilter),typeof(MeshRenderer));baked.transform.SetParent(skins[0].transform,false);
            baked.GetComponent<MeshFilter>().sharedMesh=mesh;baked.GetComponent<MeshRenderer>().sharedMaterials=skins[0].sharedMaterials;
            bool[] enabled=skins.Select(r=>r.enabled).ToArray();var target=new RenderTexture(960,960,24);var texture=new Texture2D(960,960,TextureFormat.RGB24,false);
            var active=RenderTexture.active;
            try
            {
                foreach(var skin in skins)skin.enabled=false;
                camera.targetTexture=target;camera.Render();RenderTexture.active=target;
                texture.ReadPixels(new Rect(0,0,960,960),0,0);texture.Apply();File.WriteAllBytes("Screenshots/"+name+".png",texture.EncodeToPNG());
            }
            finally
            {
                camera.targetTexture=null;RenderTexture.active=active;
                for(int i=0;i<skins.Length;i++)skins[i].enabled=enabled[i];
                UnityEngine.Object.DestroyImmediate(baked);UnityEngine.Object.DestroyImmediate(mesh);
                UnityEngine.Object.DestroyImmediate(texture);UnityEngine.Object.DestroyImmediate(target);
            }
        }
    }
}
