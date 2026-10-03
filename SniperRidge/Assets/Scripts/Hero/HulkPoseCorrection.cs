using UnityEngine;

namespace SniperRidge
{
    // Final anatomical constraints on the visible rig, after FBX sampling and footwork.
    // The controller owns translation; all IK preserves the imported bone lengths.
    public sealed class HulkPoseCorrection
    {
        readonly Transform root,visual,hips;
        readonly HulkModelRetargeter rig;
        readonly Limb[] arms,legs;
        readonly Transform[] torso;
        readonly Quaternion[] torsoRest;
        readonly float hipHeight;
        readonly Vector3[] targets=new Vector3[2];
        readonly float[] pitches=new float[2];
        sealed class Limb
        {
            public Transform upper,lower,end,toe;
            public Quaternion sole, toeRest;
            public float side;
            public bool planted;public Vector3 contact;
        }
        public HulkPoseCorrection(Transform visual,HulkModelRetargeter rig)
        {
            this.visual=visual;root=visual.parent;this.rig=rig;
            var a=rig.Character;Transform B(HumanBodyBones b)=>a.GetBoneTransform(b);
            hips=B(HumanBodyBones.Hips);hipHeight=root.InverseTransformPoint(hips.position).y;
            arms=new[]{new Limb{upper=B(HumanBodyBones.LeftUpperArm),lower=B(HumanBodyBones.LeftLowerArm),end=B(HumanBodyBones.LeftHand)},
                new Limb{upper=B(HumanBodyBones.RightUpperArm),lower=B(HumanBodyBones.RightLowerArm),end=B(HumanBodyBones.RightHand)}};
            legs=new[]{new Limb{upper=B(HumanBodyBones.LeftUpperLeg),lower=B(HumanBodyBones.LeftLowerLeg),end=B(HumanBodyBones.LeftFoot),toe=B(HumanBodyBones.LeftToes)},
                new Limb{upper=B(HumanBodyBones.RightUpperLeg),lower=B(HumanBodyBones.RightLowerLeg),end=B(HumanBodyBones.RightFoot),toe=B(HumanBodyBones.RightToes)}};
            foreach(var l in arms)l.side=Mathf.Sign(root.InverseTransformPoint(l.upper.position).x);
            foreach(var l in legs){l.side=Mathf.Sign(root.InverseTransformPoint(l.upper.position).x);l.sole=Quaternion.Inverse(root.rotation)*l.end.rotation;l.toeRest=l.toe.localRotation;}
            torso=new[]{B(HumanBodyBones.Spine),B(HumanBodyBones.Chest),B(HumanBodyBones.UpperChest),B(HumanBodyBones.Neck),B(HumanBodyBones.Head)};
            torsoRest=new Quaternion[torso.Length];for(int i=0;i<torso.Length;i++)torsoRest[i]=Quaternion.Inverse(root.rotation)*torso[i].rotation;
        }
        static float Ease(float age,float start,float end)=>Mathf.SmoothStep(0,1,Mathf.InverseLerp(start,end,age));
        public void Apply(float speed,HulkController.Attack attack,float age,bool left,bool grounded,float transformation)
        {
            if(transformation>=0)return;
            bool punch=attack==HulkController.Attack.Punch;
            bool running=attack==HulkController.Attack.None&&speed>.2f&&grounded;
            float punchBlend=Ease(age,0,.08f)*(1-Ease(age,.60f,HulkController.PunchDuration));
            float runBlend=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.2f,1.4f,speed));
            if(punch)
            {
                // Keep the imported wind-up, but prevent the source's sweeping turn from
                // pointing the chest away from the opponent during a forward game attack.
                for(int i=0;i<torso.Length;i++)torso[i].rotation=Quaternion.Slerp(torso[i].rotation,Quaternion.RotateTowards(root.rotation*torsoRest[i],torso[i].rotation,i==4?12:24),punchBlend);
                float reach=Ease(age,.13f,HulkController.PunchImpactTime)*(1-Ease(age,HulkController.PunchImpactTime+.055f,HulkController.PunchDuration));
                for(int i=0;i<2;i++)
                {
                    var a=arms[i];bool striking=(i==0)==left;
                    Vector3 guard=a.upper.position+root.right*a.side*.035f-root.up*.19f+root.forward*.30f;
                    float length=Vector3.Distance(a.upper.position,a.lower.position)+Vector3.Distance(a.lower.position,a.end.position);
                    Vector3 target=Vector3.Lerp(guard,a.upper.position+root.forward*(length*.98f)-root.up*.06f,striking?reach:0);
                    Solve(a,Vector3.Lerp(a.end.position,target,punchBlend),root.right*a.side*.65f-root.up*.7f);
                }
            }
            if(running)
            {
                // Retain the clip's stride phase, but fit its swing to the shorter, heavier
                // character. The old retarget lifted an ankle above the opposite knee.
                for(int i=0;i<2;i++)
                {
                    var arm=arms[i];Vector3 source=visual.InverseTransformPoint(arm.end.position)*HulkVisual.ModelScale;
                    Vector3 target=arm.upper.position+visual.right*arm.side*.03f;
                    target.y=root.position.y+Mathf.Clamp(source.y,1.05f,1.45f);
                    target+=visual.forward*Mathf.Clamp(source.z,-.3f,.48f);
                    Solve(arm,Vector3.Lerp(arm.end.position,target,runBlend),-visual.forward*.8f-visual.up*.5f+visual.right*arm.side*.2f);
                }
                for(int i=0;i<2;i++)
                {
                    var leg=legs[i];Vector3 p=visual.InverseTransformPoint(leg.end.position)*HulkVisual.ModelScale;
                    float lift=Mathf.Clamp((p.y-.09f)*.5f,0,.48f);
                    targets[i]=root.position+visual.right*leg.side*.22f+visual.forward*Mathf.Clamp(p.z,-.55f,.55f);
                    targets[i].y=Ground(targets[i])+.105f+lift;
                    if(lift<.05f&&runBlend>.95f)
                    {
                        if(!leg.planted||Vector3.Distance(leg.contact,targets[i])>.7f)leg.contact=targets[i];
                        leg.planted=true;targets[i]=leg.contact;
                    }
                    else leg.planted=false;
                    pitches[i]=Mathf.Lerp(0,32,Mathf.Clamp01(lift/.3f));
                }
                Vector3 hp=hips.position;hp.y=Mathf.Lerp(hp.y,root.position.y+hipHeight-.06f,runBlend);hips.position=hp;
                for(int i=0;i<2;i++)
                {
                    var leg=legs[i];Solve(leg,Vector3.Lerp(leg.end.position,targets[i],runBlend),visual.forward);
                    leg.end.rotation=Quaternion.Slerp(leg.end.rotation,Quaternion.AngleAxis(pitches[i],visual.right)*visual.rotation*leg.sole,runBlend);
                    leg.toe.localRotation=Quaternion.Slerp(leg.toe.localRotation,leg.toeRest,runBlend);
                }
            }
            if(!running)foreach(var leg in legs)leg.planted=false;
            if(punch||running||attack==HulkController.Attack.Kick)
            {
                for(int i=0;i<2;i++)
                {
                    var arm=arms[i];Vector3 forward=(arm.end.position-arm.lower.position).normalized;
                    // Knuckles continue the forearm. Avoid the FBX's palm-up wrist offset.
                    Vector3 palm=punch?-root.up:visual.right*arm.side;
                    Quaternion original=arm.end.rotation;
                    rig.AlignWrist(i==0,forward,palm);
                    arm.end.rotation=Quaternion.Slerp(original,arm.end.rotation,punch?punchBlend:running?runBlend:1);
                }
                rig.PoseHands(punch?1:running?.85f:.65f,0);
            }
        }
        float Ground(Vector3 point)
        {
            if(Physics.Raycast(point+Vector3.up*.7f,Vector3.down,out var hit,1.3f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)&&Mathf.Abs(hit.point.y-root.position.y)<.4f)return hit.point.y;
            return root.position.y;
        }
        static void Solve(Limb l,Vector3 target,Vector3 pole)
        {
            float a=Vector3.Distance(l.upper.position,l.lower.position),b=Vector3.Distance(l.lower.position,l.end.position);
            Vector3 delta=target-l.upper.position;float d=Mathf.Clamp(delta.magnitude,Mathf.Abs(a-b)+.01f,a+b-.01f);
            Vector3 forward=delta.normalized,bend=Vector3.ProjectOnPlane(pole,forward).normalized;
            float along=(a*a-b*b+d*d)/(2*d);
            Vector3 joint=l.upper.position+forward*along+bend*Mathf.Sqrt(Mathf.Max(0,a*a-along*along));
            l.upper.rotation=Quaternion.FromToRotation(l.lower.position-l.upper.position,joint-l.upper.position)*l.upper.rotation;
            l.lower.rotation=Quaternion.FromToRotation(l.end.position-l.lower.position,l.upper.position+forward*d-l.lower.position)*l.lower.rotation;
        }
    }
}
