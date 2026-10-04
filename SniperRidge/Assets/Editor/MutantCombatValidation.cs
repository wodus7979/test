using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge.EditorTools
{
    [InitializeOnLoad]
    public static class MutantCombatValidation
    {
        const string Key="MutantCombat.Validation";
        static int stage,last=-1,punches,frame;
        static float at,nextShot,headStart,kneeTravel;
        static Vector3 arena=new Vector3(1500,40.05f,1500),moveStart;
        static Quaternion kneeStart;
        static HulkController h;
        static EnemySoldier enemy,bulletEnemy;
        static DestructibleVehicle car,neighbor;
        static Mesh neighborMesh;
        static GameObject wall;
        static Vector2 move;
        static MutantCombatValidation(){EditorApplication.update+=Poll;}
        static void Check(bool ok,string message){if(!ok)throw new Exception("Mutant combat: "+message);}
        static void Next(){stage++;at=Time.time;}
        public static void Run()
        {
            NativeMutantValidation.Run();PreviewDeath();
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");
            File.Delete("Logs/autoplay_result.txt");File.Delete("Logs/mutant-combat-play.txt");
            File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=60\ntag=mutant_combat\nquit=1\n");
            SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Freeze(EnemySoldier e)
        {e.enabled=false;if(e.Combat)e.Combat.enabled=false;var n=e.GetComponent<AssaultNavigation>();if(n)n.enabled=false;var a=e.GetComponent<NavMeshAgent>();if(a)a.enabled=false;}
        static void Teleport(SniperController p,Vector3 pos)
        {var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.SetPositionAndRotation(pos,Quaternion.identity);c.enabled=true;Physics.SyncTransforms();}
        static EnemySoldier Spawn(GameManager gm,Vector3 pos)
        {var e=LevelBuilder.SpawnAssaultSoldier(gm,AssaultLayout.Start,true,1919,EnemyRole.MachineGunner,false);gm.Assault.Soldiers.Add(e);Freeze(e);e.transform.position=pos;typeof(EnemySoldier).GetProperty("Health").SetValue(e,100f);Physics.SyncTransforms();return e;}
        static void Record(Camera camera,string name)
        {
            var previous=camera.targetTexture;var old=RenderTexture.active;var rt=new RenderTexture(800,500,24);var image=new Texture2D(800,500,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,800,500),0,0);image.Apply();Directory.CreateDirectory("Screenshots/mutant_combat");File.WriteAllBytes("Screenshots/mutant_combat/"+name+".png",image.EncodeToPNG());}
            finally{camera.targetTexture=previous;RenderTexture.active=old;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);}
        }
        static void RecordGame(string name)
        {
            // Side/rear view of the real runtime actors, without changing the player's camera.
            var go=new GameObject("Test camera");var c=go.AddComponent<Camera>();c.CopyFrom(GameManager.Instance.PlayerEye.GetComponent<Camera>());
            c.transform.position=arena+new Vector3(7,4,-6);c.transform.LookAt(arena+new Vector3(0,1.2f,2));c.fieldOfView=50;
            Record(c,name);UnityEngine.Object.DestroyImmediate(go);
        }
        public static void PreviewDeath()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var model=UnityEngine.Object.Instantiate(Resources.Load<GameObject>("Enemies/SoldierModel"));foreach(var a in model.GetComponentsInChildren<Animator>())a.enabled=false;
            var clip=Resources.Load<AnimationClip>("Enemies/StandingReactDeathRight");Check(clip&&clip.length>3,"death clip missing/truncated");
            RenderSettings.ambientLight=new Color(.65f,.65f,.65f);var light=new GameObject("Key").AddComponent<Light>();light.type=LightType.Directional;light.intensity=1;light.transform.rotation=Quaternion.Euler(35,-35,0);
            var floor=GameObject.CreatePrimitive(PrimitiveType.Plane);floor.GetComponent<Renderer>().sharedMaterial=new Material(Shader.Find("Standard")){color=new Color(.24f,.26f,.28f)};
            var camera=new GameObject("Preview").AddComponent<Camera>();camera.transform.position=new Vector3(4,2.7f,-4);camera.transform.LookAt(new Vector3(0,.8f,0));camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.17f,.2f,.23f);camera.fieldOfView=45;
            float first=0,lastHead=0;var head=model.GetComponentsInChildren<Transform>().First(t=>t.name.EndsWith("Head"));var mesh=new Mesh();
            for(int f=0;f<=7;f++)
            {
                clip.SampleAnimation(model,f*.5f);if(f==0)first=head.position.y;lastHead=head.position.y;
                foreach(var skin in model.GetComponentsInChildren<SkinnedMeshRenderer>())
                {skin.BakeMesh(mesh);Check(mesh.vertices.All(v=>skin.transform.TransformPoint(v).y>-.015f),"death skin penetrates floor at "+f);}
                Record(camera,"death_pose_"+f);
            }
            Check(first-lastHead>.7f,"death does not collapse: "+first+" -> "+lastHead);
            UnityEngine.Object.DestroyImmediate(mesh);Directory.CreateDirectory("Logs");File.WriteAllText("Logs/death-preview.txt",$"PASS: 3.5 second death, grounded retarget, head {first:F3} -> {lastHead:F3}m\n");
        }
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            if(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)>240){Debug.LogError("Mutant combat timeout "+stage);SessionState.SetBool(Key,false);EditorApplication.Exit(2);return;}
            try
            {
                var gm=GameManager.Instance;
                if(EditorApplication.isPlaying&&gm&&gm.IsPlaying&&gm.Assault!=null)
                {
                    if(last==Time.frameCount)return;last=Time.frameCount;var p=gm.Player;float age=Time.time-at;
                    if(h&&h.Active){h.Move(move,Time.deltaTime,false);h.Tick(0);}
                    if(stage>1&&stage<11&&Time.time>nextShot){RecordGame("frame_"+(frame++).ToString("D3"));nextShot=Time.time+.12f;}
                    if(stage==0&&p.State==SniperController.WeaponState.Ready)
                    {
                        gm.Assault.StopAllCoroutines();foreach(var e in gm.Assault.Soldiers)Freeze(e);gm.Assault.enabled=false;p.enabled=false;
                        gm.Health.Max=10000;gm.Health.Configure(0,10000);
                        var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=arena+Vector3.down*.55f;floor.transform.localScale=new Vector3(100,1,100);
                        Teleport(p,arena);h=p.Hulk;Check(h.Toggle(),"transform failed");Next();
                    }
                    else if(stage==1&&age>HulkController.TransformDuration+.3f)
                    {
                        Check(Mathf.Abs(p.GetComponent<CharacterController>().height-2.76f)<.001f,"20% capsule scale missing");
                        var data=h.Visual.Definition;var sample=UnityEngine.Object.Instantiate(data.Model);data.Jump.SampleAnimation(sample,0);
                        var skin=sample.GetComponentInChildren<SkinnedMeshRenderer>();var mesh=new Mesh();skin.BakeMesh(mesh);var v=mesh.vertices.Select(x=>skin.transform.TransformPoint(x).y).ToArray();Check(Mathf.Abs((v.Max()-v.Min())*data.Scale-2.76f)<.02f,"model height is not 2.76m");UnityEngine.Object.DestroyImmediate(mesh);UnityEngine.Object.DestroyImmediate(sample);
                        enemy=Spawn(gm,arena+Vector3.forward*2.5f);headStart=enemy.GetComponentInChildren<EnemyAnimationRig>().AnimatedHead.position.y;
                        Check(h.BeginAttack(HulkController.Attack.Punch),"melee kill punch failed");Next();
                    }
                    else if(stage==2&&age>HulkController.PunchImpactTime+.2f)
                    {Check(enemy.IsDead&&enemy.GetComponentInChildren<EnemyAnimationRig>().UsesMeleeDeath,"melee death clip not selected");Check(!enemy.transform.Find("DeathPhysics"),"ragdoll interrupted authored death");RecordGame("melee_death_start");Next();}
                    else if(stage==3&&age>3.8f)
                    {
                        Check(headStart-enemy.GetComponentInChildren<EnemyAnimationRig>().AnimatedHead.position.y>.7f,"enemy never fell");Check(enemy.transform.Find("DeathPhysics"),"final death did not settle into physics");
                        bulletEnemy=Spawn(gm,arena+Vector3.right*8);bulletEnemy.TakeHit(999,false,Vector3.forward);Check(!bulletEnemy.GetComponentInChildren<EnemyAnimationRig>().UsesMeleeDeath&&bulletEnemy.transform.Find("DeathPhysics"),"gunshot death changed");
                        car=UrbanProps.Place("Abandoned sedan",null,arena+new Vector3(0,0,4),90).GetComponent<DestructibleVehicle>();
                        neighbor=UrbanProps.Place("Abandoned sedan",null,arena+new Vector3(-8,0,4),90).GetComponent<DestructibleVehicle>();neighborMesh=neighbor.GetComponent<MeshFilter>().sharedMesh;
                        wall=GameObject.CreatePrimitive(PrimitiveType.Cube);wall.transform.position=arena+new Vector3(0,1.5f,1.4f);wall.transform.localScale=new Vector3(7,3,.25f);Physics.SyncTransforms();
                        Check(!DestructibleVehicle.PunchNearest(arena+Vector3.up*1.15f,Vector3.forward,3.8f)&&car.Hits==0,"punch goes through wall");wall.SetActive(false);UnityEngine.Object.Destroy(wall);Physics.SyncTransforms();Next();
                    }
                    else if(stage==4&&age>.25f){Check(h.BeginAttack(HulkController.Attack.Punch),"car punch rejected");Next();}
                    else if(stage==5&&age>HulkController.PunchDuration+.2f)
                    {
                        punches++;Check(car.Hits==punches,"car hit count expected "+punches+" got "+car.Hits);Check(neighbor.Hits==0&&neighbor.GetComponent<MeshFilter>().sharedMesh==neighborMesh,"shared car damaged");
                        Check(car.GetComponent<MeshFilter>().sharedMesh!=neighborMesh,"dent uses shared source mesh");
                        if(punches<5){Check(!car.Destroyed&&!car.Burning,"car destroyed before fifth punch");stage=4;at=Time.time;}
                        else{Check(car.Destroyed&&car.Burning,"fifth punch did not destroy/ignite car");RecordGame("wreck");Check(!DestructibleVehicle.PunchNearest(arena+Vector3.up*1.15f,Vector3.forward,3.8f)&&car.Hits==5,"wreck can explode repeatedly");Next();}
                    }
                    else if(stage==6&&age>.4f)
                    {gm.Health.TakeDamage(5);Check(!h.Blocking,"single hit activates guard");Next();}
                    else if(stage==7&&age>.15f)
                    {gm.Health.TakeDamage(5);gm.Health.TakeDamage(5);Check(h.Blocking,"third hit does not guard");move=Vector2.left;moveStart=p.transform.position;kneeStart=h.Visual.MotionBones.First(b=>b.name=="mixamorig:LeftLeg").localRotation;Next();}
                    else if(stage==8)
                    {
                        kneeTravel=Mathf.Max(kneeTravel,Quaternion.Angle(kneeStart,h.Visual.MotionBones.First(b=>b.name=="mixamorig:LeftLeg").localRotation));
                        if(age<.7f)return;Check(h.Blocking&&h.Visual.GuardVisible,"guard not visible");Check(kneeTravel>25&&Vector3.Distance(moveStart,p.transform.position)>2,"guard locks legs/movement");RecordGame("running_guard");Check(h.BeginAttack(HulkController.Attack.Punch)&&!h.Blocking,"guard prevents attack");move=Vector2.zero;Next();
                    }
                    else if(stage==9&&age>HulkController.PunchDuration+.3f)
                    {Check(!h.Visual.GuardVisible,"guard overrides strike");gm.Health.TakeDamage(5);gm.Health.TakeDamage(5);gm.Health.TakeDamage(5);Check(h.Blocking,"second guard missing");Next();}
                    else if(stage==10&&age>1.6f)
                    {
                        Check(!h.Blocking&&!h.Visual.GuardVisible,"guard never ends");Check(car.Burning&&car.GetComponentsInChildren<ParticleSystem>().All(ps=>ps.isPlaying),"wreck fire/smoke stopped");
                        Check(h.Toggle(),"FPS return failed");Check(p.GetComponent<CharacterController>().height<2.4f,"FPS collider not restored");p.enabled=true;
                        File.WriteAllText("Logs/mutant-combat-play.txt","PASS: 20% height/model/collider; real punch kills using 3.5s Standing React Death Right then ragdoll; gunshot ragdoll unchanged; wall blocks car punch; 1 hit per punch; 4 hits intact, fifth dents/destroys/ignites; independent neighbor meshes; no repeated wreck explosion; 3 rapid hits trigger Standing Block Idle; guard keeps run legs/movement, permits attack and expires; persistent fire/smoke; FPS restore.\nKnee travel="+kneeTravel+"deg\n");Debug.Log("[Mutant combat] PASS");stage=99;
                    }
                }
                if(!File.Exists("Logs/autoplay_result.txt")||EditorApplication.isPlayingOrWillChangePlaymode)return;
                string result=File.ReadAllText("Logs/autoplay_result.txt");SessionState.SetBool(Key,false);EditorApplication.Exit(stage==99&&result.Contains("errors=0")?0:3);
            }
            catch(Exception ex){Debug.LogException(ex);SessionState.SetBool(Key,false);EditorApplication.Exit(4);}
        }
    }
}
