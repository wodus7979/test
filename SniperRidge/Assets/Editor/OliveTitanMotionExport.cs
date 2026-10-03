using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
namespace SniperRidge.EditorTools
{
    public static class OliveTitanMotionExport
    {
        [Serializable] public class BonePose {public string name;public Vector3 position;public Quaternion rotation;}
        [Serializable] public class Frame {public float time;public BonePose[] bones;}
        [Serializable] public class Take {public string name;public float duration;public List<Frame> frames=new List<Frame>();}
        [Serializable] public class Export {public BonePose[] rest;public List<Take> takes=new List<Take>();}
        public static void Run()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var asset=UnityEngine.Object.Instantiate(Resources.Load<GameObject>(HulkVisual.Resource));
            var rig=asset.GetComponent<HulkModelRetargeter>();
            BonePose[] Read(Transform root)=>root.GetComponentsInChildren<Transform>().Where(t=>t!=root&&!t.GetComponent<Renderer>()&&!(root.Find("Blender motion sampler")&&t.IsChildOf(root.Find("Blender motion sampler")))).Select(t=>new BonePose{name=t.name,position=root.InverseTransformPoint(t.position),rotation=Quaternion.Inverse(root.rotation)*t.rotation}).ToArray();
            var data=new Export{rest=Read(rig.Character.transform)};UnityEngine.Object.DestroyImmediate(asset);
            foreach(string name in new[]{"Idle","Walk","Run","PunchRight","PunchLeft","Clap","JumpLoad","JumpAir","Land"})
            {
                var parent=new GameObject("Export subject");var v=HulkVisual.Create(parent.transform);v.EnableBlenderMotion=false;rig=v.GetComponent<HulkModelRetargeter>();
                float duration=name=="Idle"?3.8f:name=="Walk"?1.95f/HulkController.WalkSpeed:name=="Run"?4.5f/HulkController.RunSpeed:name.StartsWith("Punch")?.72f:name=="Clap"?1.1f:name=="JumpLoad"?.22f:name=="JumpAir"?1:name=="Land"?.55f:1;
                float speed=name=="Walk"?HulkController.WalkSpeed:name=="Run"?HulkController.RunSpeed:0;
                for(int i=0;i<120;i++){v.SetMotion(Vector3.forward*speed,0,0);v.Pose(speed,HulkController.Attack.None,0,true,false,-1,1f/60);}
                typeof(HulkVisual).GetField("gaitPhase",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(v,-speed/(30*(name=="Run"?4.5f:1.95f)));
                var take=new Take{name=name,duration=duration};int count=Mathf.CeilToInt(duration*30);
                for(int i=0;i<=count;i++)
                {
                    float t=duration*i/count;v.PunchLeft=name=="PunchLeft";
                    var attack=name.StartsWith("Punch")?HulkController.Attack.Punch:name=="Clap"?HulkController.Attack.Clap:name.StartsWith("Jump")||name=="Land"?HulkController.Attack.Slam:HulkController.Attack.None;
                    v.SetJumpMotion(name=="JumpAir"?Mathf.Lerp(13,-13,t):0,name=="JumpAir");
                    v.SetMotion(Vector3.forward*speed,0,0);v.Pose(speed,attack,name=="JumpAir"?t+.22f:t,name!="JumpAir",name=="Land",-1,1f/30);
                    take.frames.Add(new Frame{time=t,bones=Read(rig.Character.transform)});
                }
                data.takes.Add(take);UnityEngine.Object.DestroyImmediate(parent);
            }
            Directory.CreateDirectory("Assets/OliveTitan/AnimationSource");
            File.WriteAllText("Assets/OliveTitan/AnimationSource/UnityMotionBaseline.json",JsonUtility.ToJson(data));
            Debug.Log("[Blender motion export] Exported "+data.takes.Count+" takes");
        }
    }
}
