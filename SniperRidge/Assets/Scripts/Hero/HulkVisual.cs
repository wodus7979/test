using System.Collections.Generic;
using UnityEngine;
namespace SniperRidge
{
    /// <summary>Drives the Olive Titan model through the existing motion rig and gameplay clocks.</summary>
    public sealed class HulkVisual : MonoBehaviour
    {
        public const string Resource="Hero/OliveTitanPlayer";
        public const float ModelScale=1.16f;
        public string Motion { get; private set; }
        public bool UsesReferenceAsset => retargeter!=null && retargeter.Ready;
        public Transform[] MotionBones => bones;
        HulkModelRetargeter retargeter;
        BlenderMotionLayer blenderMotion;
        HulkCombatFootwork combatFootwork;
        public bool EnableBlenderMotion { get; set; } = true;
        public bool UsesBlenderMotion => blenderMotion!=null && blenderMotion.Ready;
        public bool UsesFullBodyRun => EnableBlenderMotion && blenderMotion!=null && blenderMotion.FullBodyRun;
        public bool UsesAuthoredCombat => EnableBlenderMotion && blenderMotion!=null && blenderMotion.AuthoredCombat;
        public AnimationClip ActiveBlenderClip => blenderMotion?.ActiveClip;
        Animator animator;
        SkinnedMeshRenderer[] renderers;
        Transform[] bones;
        Quaternion[] blendRotations;
        Vector3[] blendPositions;
        Transform hips,spine,chest,head;
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
        float poseTime;
        Vector3 travelDirection=Vector3.forward;
        sealed class FootContact
        {
            public bool planted;
            public float phase;
            public Vector3 ankle,releaseOffset;
            public Quaternion heading;
            public void Reset(){planted=false;phase=-1;releaseOffset=Vector3.zero;}
        }
        readonly FootContact leftContact=new FootContact(),rightContact=new FootContact();
        public int FootstepSerial { get; private set; }
        public void SetMotion(Vector3 velocity,float turn,float accel)
        {localVelocity=velocity;turnRate=turn;acceleration=accel;}
        public void ResetLocomotion()
        {
            gaitPhase=smoothedSpeed=lean=sideLean=modelYaw=0;
            localVelocity=Vector3.zero;turnRate=acceleration=0;transform.localRotation=Quaternion.identity;
            leftContact.Reset();rightContact.Reset();travelDirection=transform.forward;
            combatFootwork?.Reset();
        }
        public static HulkVisual Create(Transform parent)
        {
            var prefab=Resources.Load<GameObject>(Resource);
            if(prefab==null){Debug.LogError("[Hulk] Missing gameplay prefab: "+Resource);return null;}
            var instance=Instantiate(prefab,parent,false);instance.name="Olive Titan player";
            foreach(var child in instance.GetComponentsInChildren<Transform>())child.gameObject.layer=2;
            var h=instance.AddComponent<HulkVisual>();h.Initialize();return h;
        }
        void Initialize()
        {
            animator=GetComponent<Animator>();animator.enabled=false;animator.applyRootMotion=false;
            retargeter=GetComponent<HulkModelRetargeter>();
            renderers=retargeter.VisibleRenderers;bones=retargeter.MotionBones;
            retargeter.Initialize();
            blenderMotion=new BlenderMotionLayer(retargeter.Character);
            blendRotations=new Quaternion[bones.Length];blendPositions=new Vector3[bones.Length];
            foreach(var clip in animator.runtimeAnimatorController.animationClips){lengths[clip.name]=clip.length;clips[clip.name]=clip;}
            foreach(var bone in bones)
            {
                if(bone.name=="Spine")spine=bone;if(bone.name=="Hips")hips=bone;if(bone.name=="Chest")chest=bone;if(bone.name=="Head")head=bone;
                if(bone.name=="LeftThigh")leftThigh=bone;if(bone.name=="LeftCalf")leftCalf=bone;if(bone.name=="LeftFoot")leftFoot=bone;
                if(bone.name=="RightThigh")rightThigh=bone;if(bone.name=="RightCalf")rightCalf=bone;if(bone.name=="RightFoot")rightFoot=bone;
                if(bone.name=="LeftUpperArm")leftArm=bone;if(bone.name=="LeftForearm")leftElbow=bone;if(bone.name=="LeftHand")leftHand=bone;
                if(bone.name=="RightUpperArm")rightArm=bone;if(bone.name=="RightForearm")rightElbow=bone;if(bone.name=="RightHand")rightHand=bone;
            }
            transform.localScale=Vector3.one*ModelScale;Sample("Idle",0,0);retargeter.SyncPose();
            combatFootwork=new HulkCombatFootwork(transform,retargeter.Character);
        }
        public void SetVisible(bool visible){foreach(var r in renderers)r.enabled=visible;}
        public void Pose(float speed,HulkController.Attack attack,float age,bool grounded,bool landed,float transformation=-1,float deltaTime=-1)
        {
            PoseDriver(speed,attack,age,grounded,landed,transformation,deltaTime);
            blenderMotion.RestorePositions();
            retargeter.SyncPose();
            float fist=attack==HulkController.Attack.Punch?Phase(age,0,.16f)*(1-Phase(age,.5f,.72f)):attack==HulkController.Attack.Slam?.7f:.1f;
            float clap=attack==HulkController.Attack.Clap?Phase(age,.2f,.43f)*(1-Phase(age,.62f,.92f)):0;
            retargeter.PoseHands(fist,clap);
            if(EnableBlenderMotion)blenderMotion.Apply(smoothedSpeed,gaitPhase,idleTime,attack,age,PunchLeft,jumpLaunched,jumpVelocity,landed,transformation,deltaTime<0?Time.deltaTime:deltaTime);
            // Animation-only FBXs leave many finger channels at the open bind pose.
            // Close the fists after sampling without changing the authored wrists/arms.
            retargeter.PoseHands(attack==HulkController.Attack.Punch?Mathf.Max(fist,.95f):attack==HulkController.Attack.Kick?.55f:fist,clap);
            if(EnableBlenderMotion&&blenderMotion.FullBodyPose)combatFootwork.YieldToAuthoredPose();
            else FootstepSerial+=combatFootwork.Apply(localVelocity,attack,age,PunchLeft,grounded,landed,transformation,deltaTime<0?Time.deltaTime:deltaTime);
        }
        void PoseDriver(float speed,HulkController.Attack attack,float age,bool grounded,bool landed,float transformation,float deltaTime)
        {
            float dt=deltaTime<0?Time.deltaTime:deltaTime;poseTime+=dt;
            // Keep the motion clock current during attacks, too.
            if(attack!=HulkController.Attack.None)smoothedSpeed=Mathf.Lerp(smoothedSpeed,speed,1-Mathf.Exp(-12*dt));
            if(attack!=HulkController.Attack.None || transformation>=0)
            {
                leftContact.Reset();rightContact.Reset();
                modelYaw=Mathf.LerpAngle(modelYaw,0,1-Mathf.Exp(-25*dt));
                transform.localRotation=Quaternion.Euler(0,modelYaw,0);
            }
            if(transformation>=0)
            {
                float grow=Mathf.SmoothStep(0,1,Mathf.Clamp01(transformation/.78f));
                transform.localScale=Vector3.one*ModelScale*Mathf.Lerp(.56f,1,grow);
                Sample("Transform",transformation*lengths["Transform"],.06f);
                // Build tension before opening the shoulders, then settle into a combat stance.
                float coil=Phase(transformation,0,.28f)*(1-Phase(transformation,.4f,.85f));
                float open=Phase(transformation,.22f,.60f)*(1-Phase(transformation,.75f,1));
                chest.localRotation*=Quaternion.Euler(10*coil-6*open,-9*coil,3*coil);
                head.localRotation*=Quaternion.Euler(-7*open,12*coil,0);
                leftArm.localRotation*=Quaternion.Euler(0,-8*open,-6*open);
                rightArm.localRotation*=Quaternion.Euler(0,8*open,6*open);
                return;
            }
            transform.localScale=Vector3.one*ModelScale;
            if(attack==HulkController.Attack.Punch)
            {
                Sample("Punch",age/HulkController.PunchDuration*lengths["Punch"],.07f);
                PunchPose(age);
                Fists(Mathf.SmoothStep(0,1,age/.16f)*(1-Mathf.SmoothStep(0,1,Mathf.Clamp01((age-.5f)/.22f))));
            }
            else if(attack==HulkController.Attack.Kick)
            {
                Sample("Idle",0,.08f);Motion="Kick";
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
            smoothedSpeed=Mathf.Lerp(smoothedSpeed,speed,1-Mathf.Exp(-12*dt));
            float walk=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.08f,1.1f,smoothedSpeed));
            if(UsesFullBodyRun)
            {
                Motion=walk>.1f?"Run":"Idle";
                idleTime+=dt;
                int previousStep=Mathf.FloorToInt(gaitPhase*2);
                if(grounded && speed>.15f)gaitPhase+=speed*dt/blenderMotion.RunStride;
                if(grounded && speed>.8f)FootstepSerial+=Mathf.Max(0,Mathf.FloorToInt(gaitPhase*2)-previousStep);
                // Turn the authored forward run toward all movement directions, including backwards.
                float heading=localVelocity.sqrMagnitude>.04f?Mathf.Atan2(localVelocity.x,localVelocity.z)*Mathf.Rad2Deg:modelYaw;
                modelYaw=Mathf.LerpAngle(modelYaw,heading,1-Mathf.Exp(-12*dt));
                transform.localRotation=Quaternion.Euler(0,modelYaw,0);
                ReadPose("Idle",idleTime/lengths["Idle"],null,null);
                leftContact.Reset();rightContact.Reset();
                return;
            }
            float run=Mathf.SmoothStep(0,1,Mathf.InverseLerp(4.7f,HulkController.RunSpeed,smoothedSpeed));
            Motion=run>.5f?"Run":walk>.1f?"Walk":"Idle";
            idleTime+=dt;
            // One clock and one pelvis trajectory. Do not add another crouch/bob
            // onto the pack's already lowered walk/run pelvis.
            if(grounded)gaitPhase+=speed*dt/Mathf.Lerp(1.95f,4.5f,run);
            ReadPose("Idle",idleTime/lengths["Idle"],null,null);
            float response=1-Mathf.Exp(-8*dt);
            float direction=localVelocity.sqrMagnitude>.04f?Mathf.Atan2(localVelocity.x,Mathf.Abs(localVelocity.z))*Mathf.Rad2Deg:0;
            modelYaw=Mathf.LerpAngle(modelYaw,Mathf.Clamp(direction,-80,80)*walk,response);
            transform.localRotation=Quaternion.Euler(0,modelYaw,0);
            if(localVelocity.sqrMagnitude>.04f)
                travelDirection=transform.parent.TransformDirection(localVelocity).normalized;
            lean=Mathf.Lerp(lean,Mathf.Clamp(run*6+acceleration*.12f,-3,8)*walk,response);
            sideLean=Mathf.Lerp(sideLean,Mathf.Clamp(-turnRate*.012f,-3,3)*walk,response);
            float phase=Mathf.Repeat(gaitPhase,1),wave=Mathf.Cos(phase*Mathf.PI*2);
            float breath=Mathf.Sin(idleTime*1.65f),shift=Mathf.Sin(idleTime*.73f);
            float backwards=Vector3.Dot(travelDirection,transform.forward)<0?-1:1;
            // Two small weight transfers per cycle, with extension at mid-stance.
            float height=Mathf.Lerp(1.155f,1.07f,run)-Mathf.Cos(phase*Mathf.PI*4)*Mathf.Lerp(.05f,.045f,run);
            hips.localPosition=Vector3.Lerp(new Vector3(shift*.008f,1.2259335f+breath*.004f,0),
                new Vector3(Mathf.Sin(phase*Mathf.PI*2)*.018f,height,0),walk);
            hips.localRotation=Quaternion.Slerp(hips.localRotation,Quaternion.Euler(lean*.2f,-wave*3*backwards,Mathf.Sin(phase*Mathf.PI*2)*1.5f+sideLean*.4f),walk);
            spine.localRotation=Quaternion.Slerp(spine.localRotation,Quaternion.Euler(lean*.35f,wave*2*backwards,sideLean*.3f),walk);
            chest.localRotation=Quaternion.Slerp(chest.localRotation,Quaternion.Euler(lean*.45f,wave*4*backwards-modelYaw*.18f,sideLean*.3f),walk);
            head.localRotation=Quaternion.Euler(-lean*.65f,-wave*3*backwards*walk-modelYaw*.8f+Mathf.Sin(idleTime*.48f)*1.2f*(1-walk),-sideLean*.65f);
            chest.localRotation*=Quaternion.Euler(breath*.55f*(1-walk),0,0);
            float armSwing=wave*Mathf.Lerp(19,38,run)*backwards;
            leftArm.localRotation=Quaternion.Slerp(leftArm.localRotation,Quaternion.Euler(armSwing,0,2),walk);
            rightArm.localRotation=Quaternion.Slerp(rightArm.localRotation,Quaternion.Euler(-armSwing,0,-2),walk);
            leftElbow.localRotation=Quaternion.Slerp(leftElbow.localRotation,Quaternion.Euler(-18-38*run-7*Mathf.Max(0,-wave),0,0),walk);
            rightElbow.localRotation=Quaternion.Slerp(rightElbow.localRotation,Quaternion.Euler(-18-38*run-7*Mathf.Max(0,wave),0,0),walk);
            leftHand.localRotation*=Quaternion.Euler(3*wave*walk,0,0);
            rightHand.localRotation*=Quaternion.Euler(-3*wave*walk,0,0);
            Fists(.10f+.16f*run);
            ApplyBlend(.2f);
            if(!grounded){leftContact.Reset();rightContact.Reset();return;}
            StrideFoot(leftThigh,leftCalf,leftFoot,leftContact,phase,1,run,walk);
            StrideFoot(rightThigh,rightCalf,rightFoot,rightContact,Mathf.Repeat(phase+.5f,1),-1,run,walk);
        }
        void StrideFoot(Transform thigh,Transform calf,Transform foot,FootContact contact,float phase,float side,float run,float weight)
        {
            float stance=Mathf.Lerp(.60f,.32f,run),stride=Mathf.Lerp(1.95f,4.5f,run);
            float reach=stride*stance/(2*ModelScale),z,lift,pitch;
            bool supporting=phase<stance;
            if(supporting)
            {
                float t=phase/stance;z=Mathf.Lerp(reach,-reach,t);lift=0;
                pitch=Mathf.Lerp(-12,0,Phase(t,0,.18f))+25*Phase(t,.72f,1);
            }
            else
            {
                float t=(phase-stance)/(1-stance);z=Mathf.Lerp(-reach,reach,Mathf.SmoothStep(0,1,t));
                // Early knee flexion clears the toes, then the leg extends for heel contact.
                lift=Mathf.Sin(Mathf.Pow(t,.8f)*Mathf.PI)*Mathf.Lerp(.18f,.42f,run);
                pitch=Mathf.Lerp(25,-12,Phase(t,0,.85f));
            }
            Vector3 lateral=transform.right*side*.29f*ModelScale;
            Vector3 neutral=transform.position+lateral+travelDirection*z*ModelScale+Vector3.up*.185f*ModelScale;
            if(Physics.Raycast(neutral+Vector3.up*.55f,Vector3.down,out var hit,1.15f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)
                &&Mathf.Abs(hit.point.y-transform.position.y)<.32f)
                neutral.y=hit.point.y+.185f*ModelScale;
            if(Vector3.Dot(travelDirection,transform.forward)<0)pitch=-pitch;
            Quaternion heading=Quaternion.Euler(0,transform.eulerAngles.y+side*3,0);
            bool lockFoot=weight>.98f&&smoothedSpeed>.2f;
            if(!lockFoot)contact.Reset();
            if(supporting&&lockFoot)
            {
                // Store a world-space contact: turning/accelerating must not drag a planted foot.
                if(!contact.planted||phase<contact.phase||Vector3.Distance(contact.ankle,neutral)>.65f)
                {
                    bool touchdown=contact.phase>=stance||phase<contact.phase;
                    contact.ankle=neutral;contact.heading=heading;contact.planted=true;
                    if(touchdown)FootstepSerial++;
                }
                neutral=contact.ankle;heading=contact.heading;
            }
            else if(contact.planted)
            {
                Vector3 release=transform.position+lateral-travelDirection*reach*ModelScale+Vector3.up*.185f*ModelScale;
                contact.releaseOffset=contact.ankle-release;contact.planted=false;
            }
            if(!supporting)
                neutral+=contact.releaseOffset*(1-Phase(phase,stance,1))+Vector3.up*lift*ModelScale;
            contact.phase=phase;
            // Roll around the heel/toe, rather than rotating a shoe through the floor.
            Quaternion roll=Quaternion.Euler(pitch,0,0);
            Vector3 pivot=new Vector3(0,-.185f,pitch<0?-.13f:.30f);
            Vector3 target=neutral+heading*(pivot-roll*pivot)*ModelScale;
            SolveLimb(thigh,calf,foot,Vector3.Lerp(foot.position,target,weight),transform.forward);
            foot.rotation=Quaternion.Slerp(foot.rotation,heading*roll,weight);
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
            bool driverLeft=!PunchLeft;
            // Weight shifts through the hips before the shoulder drives the fist.
            // Wind-up -> fast extension -> follow-through -> slower recovery.
            float load=Phase(age,0,.12f),strike=Phase(age,.12f,HulkController.PunchImpactTime);
            float follow=Phase(age,HulkController.PunchImpactTime,HulkController.PunchImpactTime+.05f),recover=Phase(age,HulkController.PunchImpactTime+.05f,HulkController.PunchDuration);
            float weight=load*(1-recover);
            float side=driverLeft?1:-1;
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
            PunchHand(driverLeft?leftArm:rightArm,driverLeft?leftElbow:rightElbow,driverLeft?leftHand:rightHand,target,side,blend);
            // The other hand protects the chin rather than hanging motionless.
            PunchHand(driverLeft?rightArm:leftArm,driverLeft?rightElbow:leftElbow,driverLeft?rightHand:leftHand,new Vector3(-side*.5f,2.18f,.48f),-side,blend);
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
            sampledState=state;blendAt=poseTime;
        }
        void ApplyBlend(float blend)
        {
            float weight=blend<=0?1:Mathf.Clamp01((poseTime-blendAt)/blend);
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
