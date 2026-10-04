using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.UI;

namespace SniperRidge.EditorTools
{
    [InitializeOnLoad]
    public static class VehicleSlamValidation
    {
        const string Key="VehicleSlam.Validation";
        static int stage,last=-1,landings,frame;
        static float at,roofY,nextFrame,peak;
        static Vector3 arena=new Vector3(1500,40.05f,1500);
        static Vector2 move;
        static HulkController hero;
        static GameObject car;
        static EnemySoldier near,far;
        static VehicleSlamValidation(){EditorApplication.update+=Poll;}
        static void Check(bool ok,string message){if(!ok)throw new Exception("Vehicle slam: "+message);}
        static void Next(){stage++;at=Time.time;}
        public static void Run()
        {
            NativeMutantValidation.Run();
            Check(HulkController.SlamPowerForDrop(-2)==1&&HulkController.SlamPowerForDrop(0)==1,"upward/level landing boosted");
            Check(Mathf.Approximately(HulkController.SlamPowerForDrop(20),2.5f),"drop power uncapped");
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");
            File.Delete("Logs/autoplay_result.txt");File.Delete("Logs/vehicle-slam-play.txt");
            File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=75\ntag=vehicle_slam\nquit=1\n");
            SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Freeze(EnemySoldier e){e.enabled=false;if(e.Combat)e.Combat.enabled=false;var n=e.GetComponent<AssaultNavigation>();if(n)n.enabled=false;var a=e.GetComponent<NavMeshAgent>();if(a)a.enabled=false;}
        static void SetHealth(EnemySoldier e)=>typeof(EnemySoldier).GetProperty("Health").SetValue(e,1000f);
        static EnemySoldier Spawn(GameManager gm,Vector3 point)
        {var e=LevelBuilder.SpawnAssaultSoldier(gm,AssaultLayout.Start,true,1808,EnemyRole.MachineGunner,false);gm.Assault.Soldiers.Add(e);Freeze(e);e.transform.position=point;SetHealth(e);return e;}
        static void Teleport(SniperController p,Vector3 point){var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.SetPositionAndRotation(point,Quaternion.identity);c.enabled=true;Physics.SyncTransforms();}
        static void Capture(Camera camera,string name)
        {
            var rt=new RenderTexture(960,600,24);var image=new Texture2D(960,600,TextureFormat.RGB24,false);var previous=camera.targetTexture;var old=RenderTexture.active;
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,960,600),0,0);image.Apply();Directory.CreateDirectory("Screenshots/vehicle-slam");File.WriteAllBytes("Screenshots/vehicle-slam/"+name+".png",image.EncodeToPNG());}
            finally{camera.targetTexture=previous;RenderTexture.active=old;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);}
        }
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            if(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)>240){Debug.LogError("Vehicle slam timeout stage="+stage);SessionState.SetBool(Key,false);EditorApplication.Exit(2);return;}
            try
            {
                var gm=GameManager.Instance;
                if(EditorApplication.isPlaying&&gm&&gm.IsPlaying&&gm.Assault!=null)
                {
                    if(last==Time.frameCount)return;last=Time.frameCount;float age=Time.time-at;var p=gm.Player;
                    if(hero&&hero.Active){hero.Move(move,Time.deltaTime);hero.Tick(0);}
                    if(stage>=4&&stage<=10&&Time.time>nextFrame){Capture(gm.PlayerEye.GetComponent<Camera>(),"play_"+(frame++).ToString("D3"));nextFrame=Time.time+.09f;}
                    if(stage==0&&p.State==SniperController.WeaponState.Ready)
                    {
                        p.enabled=false;gm.Assault.StopAllCoroutines();foreach(var e in gm.Assault.Soldiers)Freeze(e);gm.Assault.enabled=false;gm.Health.Max=10000;gm.Health.Configure(0,10000);
                        hero=p.Hulk;Check(hero.Toggle(),"transform rejected");VehicleCoverValidation.Validate();Next();
                    }
                    else if(stage==1&&age>HulkController.TransformDuration+.2f)
                    {
                        var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=arena+Vector3.down*.55f;floor.transform.localScale=new Vector3(100,1,100);
                        Teleport(p,arena);near=Spawn(gm,arena+new Vector3(5,0,4));far=Spawn(gm,arena+new Vector3(0,0,13.3f));Next();
                    }
                    else if(stage==2&&age>.3f){landings=hero.Landings;Check(hero.BeginAttack(HulkController.Attack.Slam),"ground jump rejected");Next();}
                    else if(stage==3)
                    {
                        peak=Mathf.Max(peak,p.transform.position.y-arena.y);
                        if(age<2.3f)return;
                        Check(hero.Landings==landings+1&&hero.Grounded,"normal jump never landed");
                        Check(peak>2.2f&&peak<2.8f,"car-clearing jump height wrong: "+peak);
                        Check(Mathf.Abs(hero.LastSlamPower-1)<.03f&&Mathf.Abs(near.Health-800)<4&&far.Health==1000,"ground slam damage/range changed");
                        car=UrbanProps.Place("Abandoned sedan",null,arena,0);Teleport(p,arena+Vector3.left*3);Next();
                    }
                    else if(stage==4&&age>.3f){landings=hero.Landings;Check(hero.BeginAttack(HulkController.Attack.Slam),"sedan mount jump rejected");move=Vector2.right;Next();}
                    else if(stage==5)
                    {
                        if(p.transform.position.x>=arena.x-.05f)move=Vector2.zero;
                        if(age<2.1f)return;
                        roofY=p.transform.position.y;Check(hero.Grounded&&hero.Landings==landings+1&&roofY-arena.y>1.3f,"cannot land on sedan: "+(p.transform.position-arena));
                        Check(hero.LastSlamPower==1,"jumping upward onto roof boosted damage");Capture(gm.PlayerEye.GetComponent<Camera>(),"sedan_roof");
                        SetHealth(near);SetHealth(far);var button=hero.GetComponentsInChildren<Button>().First(b=>b.name=="Clap");button.onClick.Invoke();Check(hero.CurrentAttack==HulkController.Attack.Clap,"roof clap button rejected");Next();
                    }
                    else if(stage==6&&age>1.7f)
                    {
                        Check(hero.Grounded&&Mathf.Abs(p.transform.position.y-roofY)<.08f,"unstable roof grounding");Check(near.Health<1000&&far.Health==890,"roof clap failed to hit street targets");
                        SetHealth(near);SetHealth(far);landings=hero.Landings;Check(hero.BeginAttack(HulkController.Attack.Slam),"roof leap rejected");move=Vector2.up;Next();
                    }
                    else if(stage==7)
                    {
                        if(p.transform.position.z>=arena.z+4.5f)move=Vector2.zero;
                        if(age<2.4f)return;move=Vector2.zero;
                        Check(hero.Grounded&&hero.Landings==landings+1&&Mathf.Abs(p.transform.position.y-arena.y)<.1f,"roof-to-street jump failed: "+(p.transform.position-arena));
                        Check(hero.LastSlamPower>1.6f&&hero.LastSlamRadius>10&&hero.LastSlamDamage>320,"high slam did not grow");
                        Check(Mathf.Abs(near.Health-(1000-hero.LastSlamDamage))<1&&Mathf.Abs(far.Health-(1000-hero.LastSlamDamage))<1,"height-scaled damage or extended radius failed: "+near.Health+","+far.Health+" at "+(p.transform.position-arena));
                        var wave=UnityEngine.Object.FindObjectsOfType<HulkWave>().FirstOrDefault(w=>!w.Directional);Check(wave&&wave.Power>1.6f,"high slam VFX not boosted");
                        UnityEngine.Object.Destroy(car);car=UrbanProps.Place("Utility van",null,arena,41);Teleport(p,arena+Vector3.left*3.6f);Next();
                    }
                    else if(stage==8&&age>.4f){Check(hero.BeginAttack(HulkController.Attack.Slam),"van mount jump rejected");move=Vector2.right;landings=hero.Landings;Next();}
                    else if(stage==9)
                    {
                        if(p.transform.position.x>=arena.x-.2f)move=Vector2.zero;
                        if(age<2.2f)return;Check(hero.Grounded&&hero.Landings==landings+1&&p.transform.position.y-arena.y>1.8f,"cannot mount rotated van: "+(p.transform.position-arena));
                        roofY=p.transform.position.y;Capture(gm.PlayerEye.GetComponent<Camera>(),"van_roof");landings=hero.Landings;Check(hero.BeginAttack(HulkController.Attack.Slam),"stationary roof jump rejected");Next();
                    }
                    else if(stage==10&&age>2)
                    {
                        Check(hero.Grounded&&hero.Landings==landings+1&&Mathf.Abs(p.transform.position.y-roofY)<.08f&&Mathf.Abs(hero.LastSlamPower-1)<.03f,"same-roof jump incorrectly boosted");
                        File.WriteAllText("Logs/vehicle-slam-play.txt","PASS: original native poses; ground jump and baseline damage; physically jump onto sedan and rotated van; stable roof grounding; roof clap hits street enemies; roof-to-street single landing; larger VFX/radius and actual enemy damage; same-roof jump unboosted; power capped; bonnet shot clearance preserved.\nJump apex="+peak+"m\n");Debug.Log("[Vehicle slam] PASS");p.enabled=true;stage=99;
                    }
                }
                if(!File.Exists("Logs/autoplay_result.txt")||EditorApplication.isPlayingOrWillChangePlaymode)return;
                string result=File.ReadAllText("Logs/autoplay_result.txt");SessionState.SetBool(Key,false);EditorApplication.Exit(stage==99&&result.Contains("errors=0")?0:3);
            }
            catch(Exception ex){Debug.LogException(ex);SessionState.SetBool(Key,false);EditorApplication.Exit(4);}
        }
    }
}
