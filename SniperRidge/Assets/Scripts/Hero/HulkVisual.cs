using System.Collections.Generic;
using UnityEngine;
namespace SniperRidge
{
    /// <summary>Animates the user's 43-bone reference pack with synchronized gameplay clocks.</summary>
    public sealed class HulkVisual : MonoBehaviour
    {
        public const string Resource="Hero/HulkReference";
        public const float ModelScale=1.16f;
        public string Motion { get; private set; }
        public bool UsesReferenceAsset => animator!=null && renderers.Length==2;
        Animator animator;
        SkinnedMeshRenderer[] renderers;
        Transform[] bones;
        Quaternion[] blendRotations;
        Vector3[] blendPositions;
        Transform hips,chest,head;
        Transform leftArm,leftElbow,leftHand,rightArm,rightElbow,rightHand;
        readonly Dictionary<string,float> lengths=new Dictionary<string,float>();
        float gaitTime,blendAt;
        public static HulkVisual Create(Transform parent)
        {
            var prefab=Resources.Load<GameObject>(Resource);
            if(prefab==null){Debug.LogError("[Hulk] Missing reference prefab: "+Resource);return null;}
            var instance=Instantiate(prefab,parent,false);instance.name="Hulk reference pack player";
            foreach(var child in instance.GetComponentsInChildren<Transform>())child.gameObject.layer=2;
            var h=instance.AddComponent<HulkVisual>();h.Initialize();return h;
        }
        void Initialize()
        {
            animator=GetComponent<Animator>();animator.enabled=false;animator.applyRootMotion=false;
            renderers=GetComponentsInChildren<SkinnedMeshRenderer>();bones=renderers[0].bones;
            blendRotations=new Quaternion[bones.Length];blendPositions=new Vector3[bones.Length];
            foreach(var clip in animator.runtimeAnimatorController.animationClips)lengths[clip.name]=clip.length;
            foreach(var bone in bones)
            {
                if(bone.name=="Hips")hips=bone;if(bone.name=="Chest")chest=bone;if(bone.name=="Head")head=bone;
                if(bone.name=="LeftUpperArm")leftArm=bone;if(bone.name=="LeftForearm")leftElbow=bone;if(bone.name=="LeftHand")leftHand=bone;
                if(bone.name=="RightUpperArm")rightArm=bone;if(bone.name=="RightForearm")rightElbow=bone;if(bone.name=="RightHand")rightHand=bone;
            }
            transform.localScale=Vector3.one*ModelScale;Sample("Idle",0,0);
        }
        public void SetVisible(bool visible){foreach(var r in renderers)r.enabled=visible;}
        public void Pose(float speed,HulkController.Attack attack,float age,bool grounded,bool landed,float transformation=-1)
        {
            if(transformation>=0)
            {
                float grow=Mathf.SmoothStep(0,1,Mathf.Clamp01(transformation/.78f));
                transform.localScale=Vector3.one*ModelScale*Mathf.Lerp(.56f,1,grow);
                Sample("Transform",transformation*lengths["Transform"],.06f);return;
            }
            transform.localScale=Vector3.one*ModelScale;
            if(attack==HulkController.Attack.Punch)
            {
                Sample("Punch",age/HulkController.PunchDuration*lengths["Punch"],.07f);
                PunchPose(age);
                Fists(Mathf.SmoothStep(0,1,age/.16f)*(1-Mathf.SmoothStep(0,1,Mathf.Clamp01((age-.5f)/.22f))));
            }
            else if(attack==HulkController.Attack.Clap)
            {
                Sample("Clap",age,.08f);
                float contact=Mathf.SmoothStep(0,1,Mathf.Clamp01((age-.2f)/.23f))*(1-Mathf.SmoothStep(0,1,Mathf.Clamp01((age-.62f)/.3f)));
                ClapHand(leftArm,leftElbow,leftHand,1,contact);ClapHand(rightArm,rightElbow,rightHand,-1,contact);
            }
            else if(attack==HulkController.Attack.Slam)
            {
                // The controller supplies actual jump height; the pack's animated hip lift must not add a second jump.
                if(landed)Sample("Land",age,.03f);
                else Sample("Air",0,.10f);
                Fists(1);
            }
            else
            {
                string name=speed>5?"Run":speed>1?"Walk":"Idle";
                gaitTime+=Time.deltaTime*(name=="Run"?Mathf.Clamp(speed/7,.7f,1.4f):name=="Walk"?speed/3:1);
                Sample(name,gaitTime%lengths[name],.14f);
            }
        }
        static float Phase(float time,float start,float end)
        {return Mathf.SmoothStep(0,1,Mathf.InverseLerp(start,end,time));}

        void PunchPose(float age)
        {
            // Weight shifts through the hips before the shoulder drives the fist.
            // Wind-up -> fast extension -> follow-through -> slower recovery.
            float load=Phase(age,0,.12f),strike=Phase(age,.12f,HulkController.PunchImpactTime);
            float follow=Phase(age,HulkController.PunchImpactTime,.36f),recover=Phase(age,.36f,HulkController.PunchDuration);
            float weight=load*(1-recover);
            float twist=(-24*load+54*strike)*(1-recover);
            hips.localRotation=Quaternion.Euler(0,twist*.35f,0);
            chest.localRotation=Quaternion.Euler(9*strike*(1-recover),twist,-5*weight);
            head.localRotation=Quaternion.Euler(-4*weight,-twist*1.35f,0);

            Vector3 guard=new Vector3(-.64f,1.85f,.27f);
            Vector3 wind=new Vector3(-.84f,1.96f,-.18f);
            Vector3 contact=new Vector3(-.14f,2.03f,1.4f);
            Vector3 through=new Vector3(.08f,1.98f,1.3f);
            Vector3 target=Vector3.Lerp(guard,wind,load);
            target=Vector3.Lerp(target,contact,strike);
            target=Vector3.Lerp(target,through,follow);
            target=Vector3.Lerp(target,guard,recover);
            float blend=Phase(age,0,.08f)*(1-Phase(age,.58f,HulkController.PunchDuration));
            PunchHand(rightArm,rightElbow,rightHand,target,-1,blend);
            // The other hand protects the chin rather than hanging motionless.
            PunchHand(leftArm,leftElbow,leftHand,new Vector3(.5f,2.18f,.48f),1,blend);
        }
        void PunchHand(Transform upper,Transform elbow,Transform hand,Vector3 localTarget,float side,float weight)
        {
            if(weight<=0)return;
            Vector3 target=Vector3.Lerp(hand.position,transform.TransformPoint(localTarget),weight);
            float a=Vector3.Distance(upper.position,elbow.position),b=Vector3.Distance(elbow.position,hand.position);
            Vector3 direction=(target-upper.position).normalized;
            float distance=Mathf.Clamp(Vector3.Distance(target,upper.position),Mathf.Abs(a-b)+.01f,a+b-.025f);
            target=upper.position+direction*distance;
            Vector3 pole=Vector3.ProjectOnPlane(transform.right*side-transform.up*.7f,direction).normalized;
            float along=(a*a-b*b+distance*distance)/(2*distance);
            Vector3 bend=upper.position+direction*along+pole*Mathf.Sqrt(Mathf.Max(0,a*a-along*along));
            upper.rotation=Quaternion.FromToRotation(elbow.position-upper.position,bend-upper.position)*upper.rotation;
            elbow.rotation=Quaternion.FromToRotation(hand.position-elbow.position,target-elbow.position)*elbow.rotation;
            Quaternion aligned=Quaternion.FromToRotation(hand.TransformDirection(Vector3.down),hand.position-elbow.position)*hand.rotation;
            hand.rotation=Quaternion.Slerp(hand.rotation,aligned,weight);
        }
        void Fists(float weight)
        {
            foreach(var bone in bones)
            {
                bool prox=bone.name.EndsWith("Prox"),dist=bone.name.EndsWith("Dist");if(!prox&&!dist)continue;
                float side=bone.name.StartsWith("Left")?1:-1;
                Quaternion closed=bone.name.Contains("Thumb")?Quaternion.Euler(prox?-35:-55,0,prox?side*38:0):Quaternion.Euler(prox?-85:-100,0,0);
                bone.localRotation=Quaternion.Slerp(bone.localRotation,closed,weight);
            }
        }
        void Sample(string motion,float time,float blend)
        {
            if(Motion!=motion)
            {
                for(int i=0;i<bones.Length;i++){blendRotations[i]=bones[i].localRotation;blendPositions[i]=bones[i].localPosition;}
                Motion=motion;blendAt=Time.time;
            }
            animator.Play(motion,0,Mathf.Clamp01(time/lengths[motion]));animator.Update(0);
            float weight=blend<=0?1:Mathf.Clamp01((Time.time-blendAt)/blend);
            if(weight<1)for(int i=0;i<bones.Length;i++)
            {bones[i].localRotation=Quaternion.Slerp(blendRotations[i],bones[i].localRotation,weight);bones[i].localPosition=Vector3.Lerp(blendPositions[i],bones[i].localPosition,weight);}
        }
        void ClapHand(Transform upper,Transform elbow,Transform hand,float side,float weight)
        {
            if(weight<=0)return;
            Vector3 target=Vector3.Lerp(hand.position,transform.TransformPoint(new Vector3(side*.08f,2.06f,.80f)),weight);
            float a=Vector3.Distance(upper.position,elbow.position),b=Vector3.Distance(elbow.position,hand.position);
            Vector3 direction=target-upper.position;float distance=Mathf.Clamp(direction.magnitude,.1f,a+b-.001f);direction.Normalize();
            Vector3 pole=Vector3.ProjectOnPlane(transform.right*side+transform.up*.1f,direction).normalized;
            float along=(a*a-b*b+distance*distance)/(2*distance);
            Vector3 bend=upper.position+direction*along+pole*Mathf.Sqrt(Mathf.Max(0,a*a-along*along));
            upper.rotation=Quaternion.FromToRotation(elbow.position-upper.position,bend-upper.position)*upper.rotation;
            elbow.rotation=Quaternion.FromToRotation(hand.position-elbow.position,target-elbow.position)*elbow.rotation;
            hand.rotation=Quaternion.Slerp(hand.rotation,Quaternion.LookRotation(-side*transform.right,transform.up),weight);
        }
    }
}
