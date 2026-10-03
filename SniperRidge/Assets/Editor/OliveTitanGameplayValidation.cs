using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class OliveTitanGameplayValidation
    {
        static void Check(bool ok,string message){if(!ok)throw new Exception("Olive Titan gameplay: "+message);}
        public static void Run()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=Vector3.down*.1f;floor.transform.localScale=new Vector3(100,.2f,100);
            var player=new GameObject("Player fixture");var visual=HulkVisual.Create(player.transform);
            Check(visual && visual.UsesReferenceAsset,"new resource not loaded");
            Check(visual.UsesBlenderMotion,"Blender-authored motion clips not loaded");
            var rig=visual.GetComponent<HulkModelRetargeter>();var animator=rig.Character;
            Check(rig.VisibleRenderers.Length==12,"three LODs/four parts missing");
            Check(rig.VisibleRenderers.All(r=>r.sharedMesh.name.Contains("LOD")),"legacy meshes still rendered");
            Transform Bone(HumanBodyBones id)=>animator.GetBoneTransform(id);
            for(int i=0;i<30;i++)visual.Pose(0,HulkController.Attack.None,0,true,false,-1,1f/60);
            var hip=Bone(HumanBodyBones.Hips);var hand=Bone(HumanBodyBones.RightHand);
            var foot=Bone(HumanBodyBones.LeftFoot);var knee=Bone(HumanBodyBones.LeftLowerLeg);var thigh=Bone(HumanBodyBones.LeftUpperLeg);
            Debug.Log("[Titan pose] idle hips="+hip.position+" foot="+foot.position+" hand="+hand.position);
            Capture(visual,"olive_titan_game_idle",true);
            Check(hip.position.y>.6f&&hip.position.y<1.8f,"hips left player space");
            float legA=Vector3.Distance(thigh.position,knee.position),legB=Vector3.Distance(knee.position,foot.position);
            float lowest=10,highest=-10;
            for(int i=0;i<120;i++)
            {
                visual.SetMotion(Vector3.forward*2.4f,0,0);visual.Pose(2.4f,HulkController.Attack.None,0,true,false,-1,1f/60);
                float angle=Vector3.Angle(knee.position-thigh.position,foot.position-knee.position);lowest=Mathf.Min(lowest,angle);highest=Mathf.Max(highest,angle);
            }
            Capture(visual,"olive_titan_game_walk",false);
            Check(highest-lowest>15,"rendered knee does not articulate");
            Check(Mathf.Abs(Vector3.Distance(thigh.position,knee.position)-legA)<.005f&&Mathf.Abs(Vector3.Distance(knee.position,foot.position)-legB)<.005f,"target leg stretches");
            visual.PunchLeft=false;visual.Pose(0,HulkController.Attack.Punch,.12f,true,false,-1,.2f);Vector3 wind=hand.position;
            visual.Pose(0,HulkController.Attack.Punch,HulkController.PunchImpactTime,true,false,-1,.2f);Vector3 hit=hand.position;
            Capture(visual,"olive_titan_game_punch_right",false);
            Debug.Log("[Titan pose] punch wind="+wind+" hit="+hit);
            Check(hit.z>wind.z+.2f,"rendered right fist not driven forward");
            visual.PunchLeft=true;visual.Pose(0,HulkController.Attack.Punch,HulkController.PunchImpactTime,true,false,-1,.2f);
            Capture(visual,"olive_titan_game_punch_left",false);
            Check(Bone(HumanBodyBones.LeftHand).position.z>Bone(HumanBodyBones.RightHand).position.z+.1f,"left punch not transferred");
            visual.Pose(0,HulkController.Attack.Clap,0,true,false,-1,.2f);float open=Vector3.Distance(hand.position,Bone(HumanBodyBones.LeftHand).position);
            visual.Pose(0,HulkController.Attack.Clap,.43f,true,false,-1,.2f);float closed=Vector3.Distance(hand.position,Bone(HumanBodyBones.LeftHand).position);
            Capture(visual,"olive_titan_game_clap",false);Check(closed<open,"clap hands do not close");
            visual.SetJumpMotion(0,true);visual.Pose(0,HulkController.Attack.Slam,.65f,false,false,-1,.2f);Capture(visual,"olive_titan_game_jump",false);
            visual.SetJumpMotion(-5,true);visual.Pose(0,HulkController.Attack.Slam,.2f,true,true,-1,.2f);Capture(visual,"olive_titan_game_land",false);
            player.transform.SetPositionAndRotation(new Vector3(1500,40,1500),Quaternion.Euler(0,65,0));
            for(int i=0;i<30;i++)visual.Pose(0,HulkController.Attack.None,0,true,false,-1,1f/60);
            var localHip=player.transform.InverseTransformPoint(hip.position);Check(localHip.magnitude<2,"retarget doubled world translation");
            visual.Pose(0,HulkController.Attack.None,0,true,false,0,1f/60);float small=visual.transform.localScale.x;
            visual.Pose(0,HulkController.Attack.None,0,true,false,1,1f/60);Check(visual.transform.localScale.x>small+.2f,"transformation growth lost");
            Directory.CreateDirectory("Logs");File.WriteAllText("Logs/olive-titan-gameplay.txt","PASS: package model, all LODs, world-space retargeting, articulated walk, fixed leg lengths, right/left punches, clap, jump/land, transformation growth.\n");
            Debug.Log("[Olive Titan gameplay] PASS");
        }
        public static void Capture(HulkVisual visual,string name,bool rear)
        {
            var root=visual.transform.parent;var adapter=visual.GetComponent<HulkModelRetargeter>();
            var lod=adapter.Character.GetComponent<LODGroup>();lod.ForceLOD(0);
            var renderers=lod.GetLODs()[0].renderers.Cast<SkinnedMeshRenderer>().ToArray();
            var baked=new System.Collections.Generic.List<GameObject>();
            var enabled=adapter.VisibleRenderers.Select(r=>r.enabled).ToArray();
            var camera=new GameObject("Preview camera").AddComponent<Camera>();camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.16f,.18f,.20f);camera.fieldOfView=33;
            camera.transform.position=root.position+(rear?new Vector3(3.8f,2.1f,-6):new Vector3(3.8f,2.1f,6));camera.transform.LookAt(root.position+Vector3.up*1.2f);
            var ambientMode=RenderSettings.ambientMode;var ambientLight=RenderSettings.ambientLight;
            RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Flat;RenderSettings.ambientLight=new Color(.6f,.6f,.6f);
            var light=new GameObject("Preview key").AddComponent<Light>();light.type=LightType.Directional;light.intensity=1.2f;light.transform.rotation=Quaternion.Euler(35,rear?-35:145,0);
            var target=new RenderTexture(1000,1100,24);var image=new Texture2D(1000,1100,TextureFormat.RGB24,false);var old=RenderTexture.active;
            try
            {
                float sole=float.PositiveInfinity;
                foreach(var skin in renderers)
                {
                    var mesh=new Mesh();skin.BakeMesh(mesh);var go=new GameObject("Baked pose",typeof(MeshFilter),typeof(MeshRenderer));go.transform.SetParent(skin.transform,false);
                    go.GetComponent<MeshFilter>().sharedMesh=mesh;go.GetComponent<MeshRenderer>().sharedMaterials=skin.sharedMaterials;baked.Add(go);
                    Check(mesh.vertices.All(v=>!float.IsNaN(v.x)&&!float.IsInfinity(v.x)),"invalid skinned mesh");
                    foreach(var v in mesh.vertices)sole=Mathf.Min(sole,skin.transform.TransformPoint(v).y-root.position.y);
                }
                if(name=="olive_titan_game_idle"){Debug.Log("[Titan sole] "+sole);Check(sole>-.06f&&sole<.08f,"rendered idle feet not grounded: "+sole);}
                foreach(var skin in adapter.VisibleRenderers)skin.enabled=false;
                camera.targetTexture=target;camera.Render();RenderTexture.active=target;image.ReadPixels(new Rect(0,0,1000,1100),0,0);image.Apply();
                Directory.CreateDirectory("Screenshots");File.WriteAllBytes("Screenshots/"+name+".png",image.EncodeToPNG());
            }
            finally
            {
                for(int i=0;i<enabled.Length;i++)adapter.VisibleRenderers[i].enabled=enabled[i];
                foreach(var go in baked){UnityEngine.Object.DestroyImmediate(go.GetComponent<MeshFilter>().sharedMesh);UnityEngine.Object.DestroyImmediate(go);}
                camera.targetTexture=null;RenderTexture.active=old;lod.ForceLOD(-1);
                RenderSettings.ambientMode=ambientMode;RenderSettings.ambientLight=ambientLight;
                UnityEngine.Object.DestroyImmediate(camera.gameObject);UnityEngine.Object.DestroyImmediate(light.gameObject);UnityEngine.Object.DestroyImmediate(target);UnityEngine.Object.DestroyImmediate(image);
            }
        }
    }
}
