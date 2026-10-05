using System.Linq;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Plays the supplied character's own Generic FBX clips on its original skeleton.</summary>
    public sealed class HulkVisual : MonoBehaviour
    {
        public const string Resource="Hero/NativeMutant";
        public const float ModelScale=1;
        public NativeMutantSet Definition { get; private set; }
        public string Motion { get; private set; }
        public bool UsesReferenceAsset => Definition && model;
        public bool UsesBlenderMotion => false;
        public bool UsesFullBodyRun => UsesReferenceAsset;
        public bool UsesAuthoredCombat => UsesReferenceAsset;
        public bool EnableBlenderMotion { get; set; }=true; // Compatibility with retired editor tools.
        public AnimationClip ActiveBlenderClip { get; private set; }
        public Transform[] MotionBones => bones;
        public bool PunchLeft { get; set; }
        public int FootstepSerial { get; private set; }
        public GameObject Model => model;
        GameObject model;
        SkinnedMeshRenderer[] renderers;
        Transform[] bones;
        Transform hips;
        GameObject locomotionSampler;
        Transform[] locomotionBones;
        bool[] lowerBody;
        Quaternion[] hitReference;
        float hitAge=99, blockWeight,guardTime;
        bool blocking;
        public bool GuardVisible => blockWeight>.5f;
        public void SetBlocking(bool active){if(active&&!blocking)guardTime=0;blocking=active;}
        public const float HitDuration=.55f;
        public bool ReactingToHit { get; private set; }
        public void ReactToHit(){if(Definition.Hit&&hitAge>.8f)hitAge=0;}
        Vector3[] outgoingPositions,lastPositions;
        Quaternion[] outgoingRotations,lastRotations;
        Vector3 velocity;
        float gait,idleTime,heading,blendAge,jumpVelocity;
        bool jumpLaunched,hasPose,vehicleJump;
        string previousState;

        public static HulkVisual Create(Transform parent)
        {
            var data=Resources.Load<NativeMutantSet>(Resource);
            if(!data||!data.Model){Debug.LogError("[Hulk] Missing supplied FBX character: "+Resource);return null;}
            var go=new GameObject("Supplied FBX mutant");go.transform.SetParent(parent,false);
            var visual=go.AddComponent<HulkVisual>();visual.Initialize(data);return visual;
        }
        void Initialize(NativeMutantSet data)
        {
            Definition=data;model=Instantiate(data.Model,transform,false);
            model.name="PumpkinHulk · original FBX";model.transform.localScale=Vector3.one*data.Scale;
            model.transform.localPosition=Vector3.up*data.GroundOffset;
            foreach(var a in model.GetComponentsInChildren<Animator>())a.enabled=false;
            foreach(var a in model.GetComponentsInChildren<Animation>())a.enabled=false;
            foreach(var t in GetComponentsInChildren<Transform>())t.gameObject.layer=2;
            renderers=model.GetComponentsInChildren<SkinnedMeshRenderer>();
            foreach(var skin in renderers)skin.updateWhenOffscreen=true;
            bones=model.GetComponentsInChildren<Transform>().Where(t=>t.name.StartsWith("mixamorig:")).ToArray();
            hips=bones.First(b=>b.name=="mixamorig:Hips");
            locomotionSampler=new GameObject("Native locomotion sampler");locomotionSampler.transform.SetParent(transform,false);
            Instantiate(hips,locomotionSampler.transform,false).name=hips.name;
            var samples=locomotionSampler.GetComponentsInChildren<Transform>().ToDictionary(t=>t.name);
            locomotionBones=bones.Select(b=>samples[b.name]).ToArray();
            lowerBody=bones.Select(b=>b==hips||b.name.Contains("Leg")||b.name.Contains("Foot")||b.name.Contains("Toe")).ToArray();
            hitReference=new Quaternion[bones.Length];
            if(data.Hit)
            {
                data.Hit.SampleAnimation(locomotionSampler,0);
                for(int i=0;i<bones.Length;i++)hitReference[i]=locomotionBones[i].localRotation;
            }
            outgoingPositions=new Vector3[bones.Length];lastPositions=new Vector3[bones.Length];
            outgoingRotations=new Quaternion[bones.Length];lastRotations=new Quaternion[bones.Length];
            Pose(0,HulkController.Attack.None,0,true,false,-1,0);
        }
        public void SetMotion(Vector3 localVelocity,float turn,float acceleration){velocity=localVelocity;}
        public void SetJumpMotion(float vertical,bool launched,bool fromVehicle=false){jumpVelocity=vertical;jumpLaunched=launched;vehicleJump=fromVehicle;}
        public void ApplyCarryPose(AnimationClip clip)
        {
            if(!clip||blocking)return;
            clip.SampleAnimation(locomotionSampler,Mathf.Min(.25f,clip.length*.1f));
            for(int i=0;i<bones.Length;i++)if(!lowerBody[i])bones[i].localRotation=locomotionBones[i].localRotation;
        }
        public void SampleExternal(AnimationClip clip,float progress)
        {
            if(!clip)return;
            transform.localRotation=Quaternion.identity;
            clip.SampleAnimation(model,Mathf.Clamp01(progress)*clip.length);
            ActiveBlenderClip=clip;Motion=clip.name;previousState="External";hasPose=true;
            for(int i=0;i<bones.Length;i++){lastPositions[i]=bones[i].localPosition;lastRotations[i]=bones[i].localRotation;}
        }
        public void SetVisible(bool visible){foreach(var skin in renderers)skin.enabled=visible;}
        public void ResetLocomotion()
        {blocking=false;blockWeight=0;hitAge=99;ReactingToHit=false;gait=idleTime=heading=blendAge=0;velocity=Vector3.zero;previousState=null;hasPose=false;transform.localRotation=Quaternion.identity;}
        public void Pose(float speed,HulkController.Attack attack,float age,bool grounded,bool landed,float transformation=-1,float deltaTime=-1)
        {
            float dt=Mathf.Max(0,deltaTime<0?Time.deltaTime:deltaTime);
            idleTime+=dt;hitAge+=dt;if(blocking)guardTime+=dt;
            // Distance, rather than a guessed clip rate, keeps the original stride in step with movement.
            int oldStep=Mathf.FloorToInt((gait-.30f)*2);
            if(speed>.08f&&grounded&&transformation<0)gait+=speed*dt/Definition.RunStride;
            if(speed>.8f&&grounded&&attack==HulkController.Attack.None)FootstepSerial+=Mathf.Max(0,Mathf.FloorToInt((gait-.30f)*2)-oldStep);
            float desiredHeading=attack==HulkController.Attack.None&&velocity.sqrMagnitude>.02f?Mathf.Atan2(velocity.x,velocity.z)*Mathf.Rad2Deg:0;
            heading=Mathf.LerpAngle(heading,desiredHeading,1-Mathf.Exp(-12*dt));transform.localRotation=Quaternion.Euler(0,heading,0);
            AnimationClip clip;float time;string state;
            if(transformation>=0){clip=Definition.Transform;time=transformation*clip.length;state="Transform";}
            else if(attack==HulkController.Attack.Punch){clip=Definition.Punch;time=age*HulkController.PunchPlaybackRate;state="Punch";}
            else if(attack==HulkController.Attack.Clap&&Definition.Clap){clip=Definition.Clap;time=age;state="Clap";}
            else if(attack==HulkController.Attack.Slam)
            {
                bool drop=vehicleJump&&Definition.JumpDown;
                clip=drop?Definition.JumpDown:Definition.Jump;state=drop?(landed?"Drop land":"Drop"):(landed?"Land":"Jump");
                float takeoff=drop?Definition.DropTakeoff:Definition.JumpTakeoff;
                float apex=drop?Definition.DropApex:Definition.JumpApex;
                float landing=drop?Definition.DropLanding:Definition.JumpLanding;
                float launch=drop?HulkController.DropLaunchSpeed:HulkController.JumpLaunchSpeed;
                if(landed)time=Mathf.Lerp(landing,clip.length,Mathf.Clamp01(age/(drop?HulkController.DropRecovery:HulkController.JumpRecovery)));
                else if(!jumpLaunched)time=takeoff*Mathf.Clamp01(age/HulkController.JumpWindup);
                else if(jumpVelocity>=0)time=Mathf.Lerp(takeoff,apex,1-Mathf.Clamp01(jumpVelocity/launch));
                else time=Mathf.Lerp(apex,drop?landing-.035f:landing,Mathf.Clamp01(-jumpVelocity/launch));
            }
            else if(blocking&&Definition.Block){clip=Definition.Block;time=Mathf.Repeat(guardTime,clip.length);state="Block";}
            else if(HeroStreetInteraction.IsPropAttack(attack))
            {clip=Definition.PropClip(attack);time=age*HeroStreetInteraction.PlaybackRate;state=attack.ToString();}
            else if(speed>.12f){clip=Definition.Run;time=Mathf.Repeat(gait,1)*clip.length;state="Run";}
            else
            {
                // Native Mixamo fighting stance, with a fallback for older asset sets.
                clip=Definition.Idle?Definition.Idle:Definition.Jump;
                time=Definition.Idle?Mathf.Repeat(idleTime,clip.length):.08f+.12f*(.5f-.5f*Mathf.Cos(idleTime*2));state="Idle";
            }
            if(state!=previousState)
            {
                System.Array.Copy(lastPositions,outgoingPositions,bones.Length);System.Array.Copy(lastRotations,outgoingRotations,bones.Length);
                blendAge=0;previousState=state;
            }
            blendAge+=dt;ActiveBlenderClip=clip;Motion=state;
            time=Mathf.Clamp(time,0,clip.length);clip.SampleAnimation(model,time);
            if(state=="Run")
            {
                Vector3 travel=Vector3.Lerp(Definition.RunStart,Definition.RunEnd,time/clip.length);travel.y=0;
                hips.localPosition-=travel;
            }
            if(state=="Idle"&&Definition.Idle)
            {
                Vector3 travel=Vector3.Lerp(Definition.IdleStart,Definition.IdleEnd,time/clip.length);travel.y=0;
                hips.localPosition-=travel;
            }
            if((attack==HulkController.Attack.Punch||attack==HulkController.Attack.Clap||state=="Block"||HeroStreetInteraction.IsPropAttack(attack))&&speed>.15f)
            {
                float runTime=Mathf.Repeat(gait,1)*Definition.Run.length;
                Definition.Run.SampleAnimation(locomotionSampler,runTime);
                Vector3 travel=Vector3.Lerp(Definition.RunStart,Definition.RunEnd,runTime/Definition.Run.length);travel.y=0;
                float weight=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.15f,1f,speed));
                for(int i=0;i<bones.Length;i++)if(lowerBody[i])
                {
                    Vector3 position=locomotionBones[i].localPosition-(bones[i]==hips?travel:Vector3.zero);
                    bones[i].localPosition=Vector3.Lerp(bones[i].localPosition,position,weight);
                    bones[i].localRotation=Quaternion.Slerp(bones[i].localRotation,locomotionBones[i].localRotation,weight);
                }
            }
            if(attack==HulkController.Attack.Slam&&!vehicleJump&&!landed&&jumpLaunched)
                hips.localPosition-=Vector3.up*Definition.JumpRootLift.Evaluate(time);
            if(attack==HulkController.Attack.Slam&&vehicleJump&&landed&&Definition.Idle)
            {
                Definition.Idle.SampleAnimation(locomotionSampler,0);
                float recover=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.3f,HulkController.DropRecovery,age));
                for(int i=0;i<bones.Length;i++)
                {
                    Vector3 position=locomotionBones[i].localPosition;
                    if(bones[i]==hips)position-=Vector3.ProjectOnPlane(Definition.IdleStart,Vector3.up);
                    bones[i].localPosition=Vector3.Lerp(bones[i].localPosition,position,recover);
                    bones[i].localRotation=Quaternion.Slerp(bones[i].localRotation,locomotionBones[i].localRotation,recover);
                }
            }
            // A short additive upper-body flinch never stops movement or overrides an attack/jump.
            ReactingToHit=!blocking&&Definition.Hit&&hitAge<HitDuration&&transformation<0&&attack==HulkController.Attack.None&&grounded;
            if(ReactingToHit)
            {
                Definition.Hit.SampleAnimation(locomotionSampler,Mathf.Clamp01(hitAge/HitDuration)*Mathf.Min(1.2f,Definition.Hit.length));
                float weight=.65f*Mathf.SmoothStep(0,1,Mathf.Clamp01(hitAge/.06f))*Mathf.SmoothStep(0,1,Mathf.Clamp01((HitDuration-hitAge)/.14f));
                for(int i=0;i<bones.Length;i++)if(!lowerBody[i]&&!bones[i].name.Contains("Hand"))
                {
                    Quaternion delta=Quaternion.Inverse(hitReference[i])*locomotionBones[i].localRotation;
                    bones[i].localRotation*=Quaternion.Slerp(Quaternion.identity,delta,weight);
                }
            }
            blockWeight=Mathf.MoveTowards(blockWeight,blocking&&transformation<0&&attack==HulkController.Attack.None?1:0,dt*9);
            // Only cross-fade whole native poses; never change knee/ankle/finger angles individually.
            float blend=hasPose?Mathf.SmoothStep(0,1,Mathf.Clamp01(blendAge/.14f)):1;
            for(int i=0;i<bones.Length;i++)
            {
                bones[i].localPosition=Vector3.Lerp(outgoingPositions[i],bones[i].localPosition,blend);
                bones[i].localRotation=Quaternion.Slerp(outgoingRotations[i],bones[i].localRotation,blend);
                lastPositions[i]=bones[i].localPosition;lastRotations[i]=bones[i].localRotation;
            }
            hasPose=true;
        }
    }
}
