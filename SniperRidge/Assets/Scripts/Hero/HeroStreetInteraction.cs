using System.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace SniperRidge
{
    [DefaultExecutionOrder(220)]
    public sealed class HeroStreetInteraction : MonoBehaviour
    {
        public const float PlaybackRate=1.5f;
        public StreetWeapon Held { get; private set; }
        StreetWeapon pending;
        HulkController hero;
        Button button;
        public void Initialize(HulkController value){hero=value;}
        public void SetButton(Button value){button=value;}
        public static bool IsPropAttack(HulkController.Attack attack)=>attack==HulkController.Attack.BarrelThrow||attack==HulkController.Attack.Uproot||attack==HulkController.Attack.PoleSwing;
        public static float EventFraction(HulkController.Attack attack)=>attack==HulkController.Attack.BarrelThrow?.55f:attack==HulkController.Attack.Uproot?.60f:.42f;
        public bool CanAttack(HulkController.Attack attack)=>attack==HulkController.Attack.Uproot?pending&&pending.Available:
            Held&&((attack==HulkController.Attack.BarrelThrow&&Held.Kind==StreetWeapon.PropKind.Barrel)||(attack==HulkController.Attack.PoleSwing&&Held.Kind==StreetWeapon.PropKind.Pole));
        public StreetWeapon Nearest()
        {
            StreetWeapon nearest=null;float best=3.4f;Vector3 origin=transform.position+Vector3.up;
            foreach(var prop in FindObjectsOfType<StreetWeapon>())
            {
                if(!prop.Available)continue;Vector3 point=prop.transform.position+Vector3.up*.7f;
                float distance=Vector3.Distance(origin,point);if(distance>best||Vector3.Angle(transform.forward,point-origin)>75)continue;
                if(EnemyProjectile.WorldHit(origin,point,null,out var hit)&&hit.collider.GetComponentInParent<StreetWeapon>()!=prop)continue;
                nearest=prop;best=distance;
            }
            return nearest;
        }
        public bool Interact()
        {
            if(!hero.Active||hero.Transforming||!hero.Grounded||hero.CurrentAttack!=HulkController.Attack.None)return false;
            if(Held){Drop();return true;}
            pending=Nearest();if(!pending){GameManager.Instance.Hud.ShowShotFeedback("드럼통이나 전봇대를 바라보고 가까이 다가가세요");return false;}
            if(pending.Kind==StreetWeapon.PropKind.Pole)return hero.BeginAttack(HulkController.Attack.Uproot);
            if(!pending.Grab())return false;Held=pending;pending=null;return true;
        }
        public void Drop()
        {
            if(hero&&hero.CurrentAttack!=HulkController.Attack.None)return;
            if(Held){Held.Drop();Held=null;}pending=null;
        }
        public void Impact(HulkController.Attack attack)
        {
            if(attack==HulkController.Attack.Uproot)
            {
                if(pending&&pending.Grab()){Held=pending;Held.Uproot();hero.Audio.Play(HulkAudio.Cue.Slam,.6f);}pending=null;
            }
            else if(attack==HulkController.Attack.BarrelThrow&&Held)
            {Held.Throw(transform.forward);Held=null;hero.Audio.Play(HulkAudio.Cue.PunchSwing);}
            else if(attack==HulkController.Attack.PoleSwing&&Held)
            {
                hero.Audio.Play(HulkAudio.Cue.PunchSwing);var gm=GameManager.Instance;Vector3 origin=transform.position+Vector3.up*1.7f;
                foreach(var enemy in gm.Assault.Soldiers.ToArray())
                {
                    if(!enemy||enemy.IsDead||enemy.IsAlly)continue;Vector3 delta=enemy.AimPoint-origin;
                    if(delta.magnitude>6.5f||Vector3.Angle(transform.forward,Vector3.ProjectOnPlane(delta,Vector3.up))>85)continue;
                    if(EnemyProjectile.WorldHit(origin,enemy.AimPoint,null,out var hit)&&hit.collider.GetComponentInParent<EnemySoldier>()!=enemy)continue;
                    bool killed=enemy.TakeHit(220,false,delta.normalized,true);gm.OnEnemyHit(enemy,false,delta.magnitude,killed,false);
                    Effects.Dust(enemy.AimPoint,-delta.normalized,.5f);hero.Audio.Play(HulkAudio.Cue.PunchHit);
                }
                DestructibleVehicle.PunchNearest(origin,transform.forward,6.5f);
            }
        }
        public void Finish(HulkController.Attack attack){if(attack==HulkController.Attack.Uproot)pending=null;}
        public void RefreshUi()
        {
            if(!button)return;button.gameObject.SetActive(hero.Active);
            button.interactable=hero.Active&&!hero.Transforming&&hero.CurrentAttack==HulkController.Attack.None;
            button.GetComponentInChildren<Text>().text=Held?"[Q] 내려놓기 · 좌클릭 공격":"[E] 드럼통 / 전봇대 집기";
        }
        void Grip(Transform[] bones,string side,Vector3 target,Transform hand)
        {
            var arm=bones.First(b=>b.name=="mixamorig:"+side+"Arm");var elbow=bones.First(b=>b.name=="mixamorig:"+side+"ForeArm");
            var rotation=hand.rotation;
            EnemyAnimationRig.SolveLimb(arm,elbow,hand,target,elbow.position+transform.forward*.15f);
            hand.rotation=rotation;
        }
        void LateUpdate()=>SyncPose();
        public void SyncPose()
        {
            if(!Held||!hero.Active)return;
            var bones=hero.Visual.MotionBones;
            var right=bones.First(b=>b.name=="mixamorig:RightHand");var left=bones.First(b=>b.name=="mixamorig:LeftHand");
            if(hero.CurrentAttack==HulkController.Attack.None)
            {
                // Carry poses use the beginning of the native action, keeping locomotion in the legs.
                var clip=Held.Kind==StreetWeapon.PropKind.Barrel?hero.Visual.Definition.ThrowIn:hero.Visual.Definition.PoleAttack;
                hero.Visual.ApplyCarryPose(clip);
            }
            if(Held.Kind==StreetWeapon.PropKind.Barrel)
            {
                Held.transform.rotation=Quaternion.LookRotation(transform.forward,Vector3.up);
                Vector3 centre=(right.position+left.position)*.5f+transform.forward*.08f;
                Held.transform.position=centre-Vector3.up*.6f;
                if(!hero.Blocking)
                {
                    Grip(bones,"Right",centre+transform.right*.38f,right);
                    Grip(bones,"Left",centre-transform.right*.38f,left);
                }
            }
            else
            {
                Held.transform.rotation=right.rotation*Quaternion.Euler(0,0,90);
                Held.transform.position=right.position-Held.transform.up*.9f;
            }
        }
    }
}
