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
        Transform leftThigh,leftCalf,leftFoot,rightThigh,rightCalf,rightFoot;
        public bool PunchLeft { get; set; }
        float jumpVelocity;bool jumpLaunched;
        public void SetJumpMotion(float velocity,bool launched){jumpVelocity=velocity;jumpLaunched=launched;}
        Transform leftArm,leftElbow,leftHand,rightArm,rightElbow,rightHand;
        readonly Dictionary<string,AnimationClip> clips=new Dictionary<string,AnimationClip>();
        readonly Dictionary<string,float> lengths=new Dictionary<string,float>();
        float gaitPhase,idleTime,blendAt,smoothedSpeed,lean,sideLean,modelYaw;
        string sampledState;
        Vector3 localVelocity;
        float turnRate,acceleration;
        Quaternion[] idleRotations,walkRotations;
        Vector3[] idlePositions,walkPositions;
        public int FootstepSerial { get; private set; }
        public void SetMotion(Vector3 velocity,float turn,float accel)
        {localVelocity=velocity;turnRate=turn;acceleration=accel;}
        public void ResetLocomotion()
        {
            gaitPhase=smoothedSpeed=lean=sideLean=modelYaw=0;
            localVelocity=Vector3.zero;turnRate=acceleration=0;transform.localRotation=Quaternion.identity;
        }
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
            idleRotations=new Quaternion[bones.Length];walkRotations=new Quaternion[bones.Length];
            idlePositions=new Vector3[bones.Length];walkPositions=new Vector3[bones.Length];
            foreach(var clip in animator.runtimeAnimatorController.animationClips){lengths[clip.name]=clip.length;clips[clip.name]=clip;}
            foreach(var bone in bones)
            {
                if(bone.name=="Hips")hips=bone;if(bone.name=="Chest")chest=bone;if(bone.name=="Head")head=bone;
                if(bone.name=="LeftThigh")leftThigh=bone;if(bone.name=="LeftCalf")leftCalf=bone;if(bone.name=="LeftFoot")leftFoot=bone;
                if(bone.name=="RightThigh")rightThigh=bone;if(bone.name=="RightCalf")rightCalf=bone;if(bone.name=="RightFoot")rightFoot=bone;
                if(bone.name=="LeftUpperArm")leftArm=bone;if(bone.name=="LeftForearm")leftElbow=bone;if(bone.name=="LeftHand")leftHand=bone;
                if(bone.name=="RightUpperArm")rightArm=bone;if(bone.name=="RightForearm")rightElbow=bone;if(bone.name=="RightHand")rightHand=bone;
            }
            transform.localScale=Vector3.one*ModelScale;Sample("Idle",0,0);
        }
        public void SetVisible(bool visible){foreach(var r in renderers)r.enabled=visible;}
        public void Pose(float speed,HulkController.Attack attack,float age,bool grounded,bool landed,float transformation=-1)
        {
            float dt=Time.deltaTime;
            if(attack!=HulkController.Attack.None || transformation>=0)
            {
                modelYaw=Mathf.LerpAngle(modelYaw,0,1-Mathf.Exp(-25*dt));
                transform.localRotation=Quaternion.Euler(0,modelYaw,0);
            }
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
                JumpPose(age,landed);
                Fists(.7f);
            }
            else
            {
                Locomotion(speed,grounded,dt);
            }
        }
        void ReadPose(string state,float phase,Quaternion[] rotations,Vector3[] positions)
        {
            // Sample every authored curve afresh so additive lean never feeds back into the next frame.
            clips[state].SampleAnimation(gameObject,Mathf.Repeat(phase,1)*lengths[state]);
            if(rotations==null)return;
            for(int i=0;i<bones.Length;i++){rotations[i]=bones[i].localRotation;positions[i]=bones[i].localPosition;}
        }
        void Locomotion(float speed,bool grounded,float dt)
        {
            BeginBlend("Locomotion");
            smoothedSpeed=Mathf.Lerp(smoothedSpeed,speed,1-Mathf.Exp(-14*dt));
            float walk=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.1f,2,smoothedSpeed));
            float run=Mathf.SmoothStep(0,1,Mathf.InverseLerp(4.7f,HulkController.RunSpeed,smoothedSpeed));
            Motion=run>.5f?"Run":walk>.1f?"Walk":"Idle";
            idleTime+=dt;
            float previous=gaitPhase;
            if(grounded)
            {
                gaitPhase+=speed*dt/Mathf.Lerp(2.3f,4.5f,run)*(localVelocity.z<-.2f?-1:1);
                if(Mathf.FloorToInt(previous*2)!=Mathf.FloorToInt(gaitPhase*2))FootstepSerial++;
            }
            ReadPose("Idle",idleTime/lengths["Idle"],idleRotations,idlePositions);
            ReadPose("Walk",gaitPhase,walkRotations,walkPositions);
            ReadPose("Run",gaitPhase,null,null);
            for(int i=0;i<bones.Length;i++)
            {
                var stride=Quaternion.Slerp(walkRotations[i],bones[i].localRotation,run);
                var position=Vector3.Lerp(walkPositions[i],bones[i].localPosition,run);
                bones[i].localRotation=Quaternion.Slerp(idleRotations[i],stride,walk);
                bones[i].localPosition=Vector3.Lerp(idlePositions[i],position,walk);
            }
            float response=1-Mathf.Exp(-7*dt);
            float direction=localVelocity.sqrMagnitude>.15f?Mathf.Atan2(localVelocity.x,Mathf.Abs(localVelocity.z))*Mathf.Rad2Deg:0;
            modelYaw=Mathf.LerpAngle(modelYaw,Mathf.Clamp(direction,-70,70)*walk,response);
            transform.localRotation=Quaternion.Euler(0,modelYaw,0);
            lean=Mathf.Lerp(lean,Mathf.Clamp(run*7+acceleration*.22f,-6,12)*walk,response);
            sideLean=Mathf.Lerp(sideLean,Mathf.Clamp(-turnRate*.025f-localVelocity.x*.45f,-9,9)*walk,response);
            float strideWave=Mathf.Sin(gaitPhase*Mathf.PI*2);
            float breath=Mathf.Sin(idleTime*1.65f),shift=Mathf.Sin(idleTime*.73f);
            hips.localRotation*=Quaternion.Euler(lean*.3f,strideWave*3*walk,sideLean*.55f+shift*1.1f*(1-walk));
            chest.localRotation*=Quaternion.Euler(lean+breath*.9f*(1-walk),-modelYaw*.45f-strideWave*4*walk,sideLean*.45f);
            head.localRotation*=Quaternion.Euler(-lean*.7f, -modelYaw*.55f+Mathf.Sin(idleTime*.48f)*2.5f*(1-walk),-sideLean*.7f);
            hips.localPosition+=new Vector3(shift*.012f*(1-walk),breath*.007f*(1-walk),0);
            // Slightly different shoulder timing prevents a rigid mirrored march.
            leftArm.localRotation*=Quaternion.Euler(Mathf.Sin(gaitPhase*Mathf.PI*2+.35f)*4*walk,0,breath*.7f);
            rightArm.localRotation*=Quaternion.Euler(-Mathf.Sin(gaitPhase*Mathf.PI*2-.2f)*4*walk,0,-breath*.6f);
            NaturalStride(walk,run,grounded);
            ApplyBlend(.2f);
        }
        void NaturalStride(float weight,float run,bool grounded)
        {
            if(!grounded||weight<=0)return;
            float phase=Mathf.Repeat(gaitPhase,1),wave=Mathf.Cos(phase*Mathf.PI*2);
            hips.localPosition+=new Vector3(Mathf.Sin(phase*Mathf.PI*2)*.025f,-(.16f+.06f*run)+Mathf.Cos(phase*Mathf.PI*4)*Mathf.Lerp(.015f,.045f,run),0)*weight;
            leftArm.localRotation=Quaternion.Slerp(leftArm.localRotation,Quaternion.Euler(wave*Mathf.Lerp(21,39,run),0,4),weight);
            rightArm.localRotation=Quaternion.Slerp(rightArm.localRotation,Quaternion.Euler(-wave*Mathf.Lerp(21,39,run),0,-4),weight);
            leftElbow.localRotation=Quaternion.Slerp(leftElbow.localRotation,Quaternion.Euler(-18-42*run,0,0),weight);
            rightElbow.localRotation=Quaternion.Slerp(rightElbow.localRotation,Quaternion.Euler(-18-42*run,0,0),weight);
            Fists(.12f+.18f*run);
            StrideFoot(leftThigh,leftCalf,leftFoot,phase,1,run,weight);
            StrideFoot(rightThigh,rightCalf,rightFoot,Mathf.Repeat(phase+.5f,1),-1,run,weight);
        }
        void StrideFoot(Transform thigh,Transform calf,Transform foot,float phase,float side,float run,float weight)
        {
            float stance=Mathf.Lerp(.56f,.32f,run),stride=Mathf.Lerp(2.3f,4.5f,run);
            float reach=stride*stance/(2*ModelScale),z,lift,pitch;
            if(phase<stance)
            {
                float t=phase/stance;z=Mathf.Lerp(reach,-reach,t);
                lift=.055f*Phase(t,.65f,1);pitch=Mathf.Lerp(-12,0,Phase(t,0,.2f))+24*Phase(t,.65f,1);
            }
            else
            {
                float t=(phase-stance)/(1-stance);z=Mathf.Lerp(-reach,reach,Mathf.SmoothStep(0,1,t));
                lift=Mathf.Sin(t*Mathf.PI)*Mathf.Lerp(.15f,.38f,run);pitch=Mathf.Lerp(20,-12,t);
            }
            PlaceFoot(thigh,calf,foot,new Vector3(side*.30f,.185f+lift,z),pitch,weight);
        }
        void PlaceFoot(Transform thigh,Transform calf,Transform foot,Vector3 localTarget,float pitch,float weight)
        {
            Vector3 target=transform.TransformPoint(localTarget);
            // Adapt the foot to small kerbs/slopes; the character controller owns body height.
            if(Physics.Raycast(target+Vector3.up*.6f,Vector3.down,out var hit,1.1f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
            {
                float groundOffset=hit.point.y-transform.position.y;
                if(Mathf.Abs(groundOffset)<.3f)target.y+=groundOffset;
            }
            target=Vector3.Lerp(foot.position,target,weight);
            SolveLimb(thigh,calf,foot,target,transform.forward);
            foot.rotation=Quaternion.Slerp(foot.rotation,transform.rotation*Quaternion.Euler(pitch,0,0),weight);
        }
        static void SolveLimb(Transform upper,Transform joint,Transform end,Vector3 target,Vector3 pole)
        {
            float a=Vector3.Distance(upper.position,joint.position),b=Vector3.Distance(joint.position,end.position);
            Vector3 direction=(target-upper.position).normalized;
            float distance=Mathf.Clamp(Vector3.Distance(target,upper.position),Mathf.Abs(a-b)+.01f,a+b-.015f);
            target=upper.position+direction*distance;pole=Vector3.ProjectOnPlane(pole,direction).normalized;
            float along=(a*a-b*b+distance*distance)/(2*distance);
            Vector3 bend=upper.position+direction*along+pole*Mathf.Sqrt(Mathf.Max(0,a*a-along*along));
            upper.rotation=Quaternion.FromToRotation(joint.position-upper.position,bend-upper.position)*upper.rotation;
            joint.rotation=Quaternion.FromToRotation(end.position-joint.position,target-joint.position)*joint.rotation;
        }
        void JumpPose(float age,bool landed)
        {
            if(landed)
            {
                Sample("Land",age,.03f);
                PlaceFoot(leftThigh,leftCalf,leftFoot,new Vector3(.3f,.185f,.04f),0,1);
                PlaceFoot(rightThigh,rightCalf,rightFoot,new Vector3(-.3f,.185f,.04f),0,1);return;
            }
            if(!jumpLaunched)
            {
                Sample("Idle",0,.04f);float load=Phase(age,0,HulkController.JumpWindup);
                hips.localPosition=new Vector3(0,1.2259335f-.28f*load,0);
                chest.localRotation=Quaternion.Euler(20*load,0,0);
                leftArm.localRotation=rightArm.localRotation=Quaternion.Euler(38*load,0,0);
                leftElbow.localRotation=rightElbow.localRotation=Quaternion.Euler(-25*load,0,0);
                PlaceFoot(leftThigh,leftCalf,leftFoot,new Vector3(.3f,.185f,0),0,1);
                PlaceFoot(rightThigh,rightCalf,rightFoot,new Vector3(-.3f,.185f,0),0,1);return;
            }
            Sample("Air",0,.06f);
            float tuck=1-Mathf.Clamp01(Mathf.Abs(jumpVelocity)/12),fall=Mathf.Clamp01(-jumpVelocity/11);
            float lift=Phase(age,HulkController.JumpWindup,HulkController.JumpWindup+.14f);
            hips.localPosition=new Vector3(0,1.2259335f,0);
            chest.localRotation=Quaternion.Euler(6+10*tuck,0,0);
            leftArm.localRotation=rightArm.localRotation=Quaternion.Euler(Mathf.Lerp(20,-150,lift)+100*fall,0,0);
            leftElbow.localRotation=rightElbow.localRotation=Quaternion.Euler(-20-25*tuck,0,0);
            leftThigh.localRotation=rightThigh.localRotation=Quaternion.Euler(-12-48*tuck,0,0);
            leftCalf.localRotation=rightCalf.localRotation=Quaternion.Euler(20+80*tuck,0,0);
            leftFoot.localRotation=rightFoot.localRotation=Quaternion.Euler(-8-32*tuck,0,0);
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
            float side=PunchLeft?1:-1;
            float twist=(-24*load+54*strike)*(1-recover)*-side;
            hips.localRotation=Quaternion.Euler(0,twist*.35f,0);
            chest.localRotation=Quaternion.Euler(9*strike*(1-recover),twist,5*side*weight);
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
            target.x*= -side;
            PunchHand(PunchLeft?leftArm:rightArm,PunchLeft?leftElbow:rightElbow,PunchLeft?leftHand:rightHand,target,side,blend);
            // The other hand protects the chin rather than hanging motionless.
            PunchHand(PunchLeft?rightArm:leftArm,PunchLeft?rightElbow:leftElbow,PunchLeft?rightHand:leftHand,new Vector3(-side*.5f,2.18f,.48f),-side,blend);
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
            BeginBlend(motion);Motion=motion;
            clips[motion].SampleAnimation(gameObject,Mathf.Clamp(time,0,lengths[motion]));
            ApplyBlend(blend);
        }
        void BeginBlend(string state)
        {
            if(sampledState==state)return;
            for(int i=0;i<bones.Length;i++){blendRotations[i]=bones[i].localRotation;blendPositions[i]=bones[i].localPosition;}
            sampledState=state;blendAt=Time.time;
        }
        void ApplyBlend(float blend)
        {
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
