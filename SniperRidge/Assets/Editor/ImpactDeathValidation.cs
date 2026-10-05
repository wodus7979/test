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
    public static class ImpactDeathValidation
    {
        const string Key="ImpactDeath.Validation";
        static int stage,last=-1;
        static float at,standingHip;
        static Vector3 arena=new Vector3(1500,40,1500),start;
        static EnemySoldier victim,survivor,blocked;
        static GameObject wall;
        static StreetWeapon pole;
        static bool airborne,fallCapture,roarChecked;
        static ImpactDeathValidation(){EditorApplication.update+=Poll;Application.logMessageReceived+=(m,s,t)=>{if(SessionState.GetBool(Key,false)&&(t==LogType.Error||t==LogType.Exception||t==LogType.Assert))SessionState.SetString(Key+"errors",SessionState.GetString(Key+"errors","")+m+"\n");};}
        public static void RunMutant()=>Run(false);
        public static void RunHuman()=>Run(true);
        public static void RunTank()=>Run(false,true);
        static void Run(bool human,bool tank=false)
        {
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/autoplay.txt","mode="+(tank?8:9)+"\nwait=500\ntag=impact_death\nquit=1\n");
            SessionState.SetBool(Key+"tank",tank);SessionState.SetBool(Key+"human",human);SessionState.SetBool(Key,true);SessionState.SetString(Key+"errors","");SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Check(bool ok,string message){if(!ok)throw new Exception("Impact death: "+message);}
        static void CheckRoar(HulkController hero)
        {
            Check(hero.Audio.Ready&&hero.Audio.Count(HulkAudio.Cue.Transform)==1,"transformation voice triggered more than once");
            var voices=hero.GetComponents<AudioSource>().Where(s=>s.clip&&s.clip.name=="transform").ToArray();
            Check(voices.Length==1&&Mathf.Abs(voices[0].clip.length-HulkController.TransformDuration)<.04f,"single synchronized roar missing");
            Check(!UnityEngine.Object.FindObjectsOfType<AudioSource>().Any(s=>s.isPlaying&&s.clip&&s.clip.name=="tank_rage"),"legacy overlapping roar still playing");
        }
        static void Next(){stage++;at=Time.time;Debug.Log("[Impact death validation] Stage "+stage);}
        static void Place(SniperController p,Vector3 point){var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.SetPositionAndRotation(point,Quaternion.identity);c.enabled=true;Physics.SyncTransforms();}
        static void EnemyAt(EnemySoldier e,Vector3 p)
        {
            e.StopAllCoroutines();e.enabled=false;if(e.Combat)e.Combat.enabled=false;
            var n=e.GetComponent<AssaultNavigation>();if(n)n.enabled=false;var a=e.GetComponent<NavMeshAgent>();if(a)a.enabled=false;
            e.transform.SetPositionAndRotation(p,Quaternion.Euler(0,180,0));Physics.SyncTransforms();
        }
        static void Capture(GameManager gm,string name,Vector3? focus=null)
        {
            var cam=gm.PlayerEye.GetComponent<Camera>();var pos=cam.transform.position;var rot=cam.transform.rotation;
            if(focus.HasValue){cam.transform.position=focus.Value+new Vector3(7,3,-9);cam.transform.LookAt(focus.Value);}
            var rt=new RenderTexture(1200,750,24);var tex=new Texture2D(1200,750,TextureFormat.RGB24,false);var old=cam.targetTexture;var active=RenderTexture.active;
            try{cam.targetTexture=rt;cam.Render();RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,1200,750),0,0);tex.Apply();Directory.CreateDirectory("Screenshots/impact-death");File.WriteAllBytes("Screenshots/impact-death/"+name+".png",tex.EncodeToPNG());}
            finally{cam.targetTexture=old;RenderTexture.active=active;cam.transform.SetPositionAndRotation(pos,rot);UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(tex);}
        }
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            try
            {
                Check(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)<300,"timeout stage "+stage);
                var gm=GameManager.Instance;if(!EditorApplication.isPlaying||!gm||(!gm.Assault&&!gm.Armor)||last==Time.frameCount)return;
                last=Time.frameCount;float age=Time.time-at;var h=gm.Player.Hulk;bool human=SessionState.GetBool(Key+"human",false);
                var actors=gm.Assault?gm.Assault.Soldiers:gm.Armor.Rampage.Infantry;
                if(stage==-1){if(h&&h.Transforming&&!roarChecked){CheckRoar(h);roarChecked=true;}if(gm.Armor.Rampage.CombatReady){stage=0;at=Time.time;}return;}
                if(stage==0&&(gm.Armor||gm.Player.State==SniperController.WeaponState.Ready))
                {
                    if(gm.Armor)
                    {
                        if((!h||!h.Active)&&(gm.Armor.Rampage.AliveInfantry<3||gm.Armor.Enemies.Count<3))return;
                        gm.Armor.StopAllCoroutines();foreach(var t in gm.Armor.Enemies){t.StopVehicle();t.enabled=false;}
                        foreach(var heli in UnityEngine.Object.FindObjectsOfType<EnemyAttackHelicopter>())heli.enabled=false;
                        if(!h||!h.Active){gm.Armor.PlayerTank.Damage(99999);stage=-1;return;}
                    }
                    else gm.Assault.StopAllCoroutines();foreach(var e in actors){e.StopAllCoroutines();e.enabled=false;if(e.Combat)e.Combat.enabled=false;var g=e.GetComponent<EnemyGrenadier>();if(g)g.enabled=false;}
                    gm.Health.Max=10000;gm.Health.Configure(999,0);
                    var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=arena-Vector3.up*.5f;floor.transform.localScale=new Vector3(100,1,100);
                    floor.GetComponent<Renderer>().material.color=new Color(.35f,.37f,.32f);
                    Place(gm.Player,arena+Vector3.up*.05f);
                    if(!human&&!h.Active){Check(h.Toggle(),"transform rejected");CheckRoar(h);}Next();
                }
                else if(stage==1&&age>4&&!h.Transforming)
                {
                    if(human){stage=7;at=Time.time;return;}
                    var targets=actors.Where(e=>!e.IsDead&&!e.IsAlly&&!e.Boss).Take(3).ToArray();victim=targets[0];survivor=targets[1];blocked=targets[2];
                    EnemyAt(victim,arena+Vector3.forward*5);EnemyAt(survivor,arena+new Vector3(-10,0,5));EnemyAt(blocked,arena+new Vector3(10,0,5));
                    start=victim.transform.position;Physics.SyncTransforms();h.HitInfantryWithProp();
                    Check(victim.IsDead&&victim.GetComponent<EnemyPropKnockback>(),"tree attack did not select throw reaction");
                    Check(!survivor.IsDead&&!blocked.IsDead,"tree hit outside its range");Next();
                }
                else if(stage==2)
                {
                    if(age>.45f&&!airborne){airborne=true;Check(victim.transform.position.y>40.5f,"no upward impact arc");Capture(gm,"tree-airborne",victim.transform.position+Vector3.up);}
                    if(age<2.7f)return;
                    Check(victim.transform.position.z-start.z>5,"no directional displacement");Check(victim.GetComponentInChildren<EnemyRagdoll>(),"lethal throw did not transfer to ragdoll");Capture(gm,"tree-landed",victim.transform.position+Vector3.up*.4f);
                    survivor.TakePropHit(20,Vector3.right);wall=GameObject.CreatePrimitive(PrimitiveType.Cube);wall.transform.position=arena+new Vector3(10,3,8);wall.transform.localScale=new Vector3(10,6,.5f);Physics.SyncTransforms();blocked.TakePropHit(300,Vector3.forward);Next();
                }
                else if(stage==3&&age>4)
                {
                    Check(!survivor.IsDead&&Mathf.Abs(survivor.Health-80)<.1f&&!survivor.GetComponent<EnemyPropKnockback>(),"survivor recovery lifecycle");
                    Check(survivor.GetComponentInChildren<EnemyAnimationRig>().enabled&&survivor.GetComponentInChildren<Animator>().enabled,"survivor animation not resumed");
                    Check(blocked.transform.position.z<arena.z+7.6f,"thrown enemy tunnelled through wall");
                    if(gm.Armor){stage=7;at=Time.time;return;}
                    UnityEngine.Object.Destroy(wall);EnemyAt(survivor,arena+new Vector3(0,0,4));
                    pole=StreetWeapon.Create(gm.Assault.transform,arena+new Vector3(1,0,2),StreetWeapon.PropKind.Pole);Physics.SyncTransforms();Check(h.Street.Interact(),"pole pickup rejected");Next();
                }
                else if(stage==4&&h.CurrentAttack==HulkController.Attack.None&&h.Street.Held)
                {Check(h.Street.Held==pole,"wrong prop picked up");Check(h.BeginAttack(HulkController.Attack.Punch),"pole attack rejected");Check(h.CurrentAttack==HulkController.Attack.PoleSwing,"not pole clip");Next();}
                else if(stage==5&&survivor.IsDead)
                {Check(survivor.GetComponent<EnemyPropKnockback>(),"pole attack did not launch victim");Capture(gm,"pole-hit",survivor.transform.position+Vector3.up);Next();}
                else if(stage==6&&age>3){h.CancelForExternal();h.Street.Drop();Next();}
                else if(stage==7&&age>.3f)
                {
                    gm.Health.TakeDamage(999999,true);Check(gm.IsDying&&!gm.IsPlaying,"death not delayed");
                    var d=gm.Player.GetComponent<PlayerDeathSequence>();Check(d&&d.Body,"missing corpse visual");standingHip=EnemyRagdoll.FindBone(d.Body.transform,"Hips").position.y;
                    gm.PlayerDied();Check(gm.Player.GetComponents<PlayerDeathSequence>().Length==1,"duplicate death presentation");Next();
                }
                else if(stage==8)
                {
                    var d=gm.Player.GetComponent<PlayerDeathSequence>();
                    if(d.Progress>.45f&&!fallCapture){fallCapture=true;Check(gm.IsDying,"results interrupted fall");Capture(gm,(human?"human":"mutant")+"-falling");}
                    if(gm.State!=GameManager.GameState.Lost)return;
                    var hip=EnemyRagdoll.FindBone(d.Body.transform,"Hips");Check(hip.position.y<standingHip-.45f,"corpse still standing");
                    Check(!gm.Player.enabled&&!h.enabled&&!gm.Player.GetComponent<CharacterController>().enabled,"dead player still controlled");
                    Capture(gm,(human?"human":"mutant")+"-fallen");Finish("PASS");
                }
            }
            catch(Exception e){Debug.LogException(e);Finish("FAIL "+e,2);}
        }
        static void Finish(string result,int code=0)
        {
            string errors=SessionState.GetString(Key+"errors","");if(errors!="")code=2;
            File.WriteAllText("Logs/impact-death-"+(SessionState.GetBool(Key+"tank",false)?"tank":SessionState.GetBool(Key+"human",false)?"human":"mutant")+".txt",result+"\n"+errors);
            SessionState.SetBool(Key,false);File.Delete("Logs/autoplay.txt");EditorApplication.Exit(code);
        }
    }
}
