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
            var authored=Resources.Load<BlenderMotionSet>("Hero/OliveTitanMotion");
            if(authored && authored.FullBodyRun){HulkRunIntegrationValidation.Run();return;}
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.ambientLight=new Color(.62f,.66f,.72f);
            var light=new GameObject("Soft key").AddComponent<Light>();light.type=LightType.Directional;
            light.intensity=1.15f;light.transform.rotation=Quaternion.Euler(45,-35,0);light.shadows=LightShadows.Soft;
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.name="Contact floor";
            floor.transform.position=Vector3.down*.1f;floor.transform.localScale=new Vector3(200,.2f,200);
            floor.GetComponent<Renderer>().sharedMaterial=new Material(Shader.Find("Standard")){color=new Color(.29f,.32f,.36f)};
            var root=new GameObject("Gait subject");var visual=HulkVisual.Create(root.transform);
            var bones=visual.MotionBones;
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
            OliveTitanGameplayValidation.Capture(visual,name,rear);
        }
    }
}
