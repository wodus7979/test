using UnityEngine;

namespace SniperRidge
{
    /// <summary>Grounded combat footwork on the visible Humanoid, after the authored upper-body pose.</summary>
    public sealed class HulkCombatFootwork
    {
        readonly Transform visual, root, hips;
        readonly Leg[] legs;
        readonly Vector3 restHip;
        float gait, movementWeight, blendAge, exitAge;
        bool active;
        HulkController.Attack previousAttack;
        
        readonly Transform[] lower;
        readonly Quaternion[] lastRot, fromRot;
        readonly Vector3[] lastPos, fromPos;
        sealed class Leg
        {
            public Transform thigh,knee,foot;
            public Quaternion restFoot;
            public float side,width;
            public bool planted;
            public float phase=-1;
            public Vector3 contact,release;
        }
        public HulkCombatFootwork(Transform owner,Animator rig)
        {
            visual=owner;root=owner.parent;hips=rig.GetBoneTransform(HumanBodyBones.Hips);
            restHip=root.InverseTransformPoint(hips.position);
            Leg Create(bool left)
            {
                var thigh=rig.GetBoneTransform(left?HumanBodyBones.LeftUpperLeg:HumanBodyBones.RightUpperLeg);
                var knee=rig.GetBoneTransform(left?HumanBodyBones.LeftLowerLeg:HumanBodyBones.RightLowerLeg);
                var foot=rig.GetBoneTransform(left?HumanBodyBones.LeftFoot:HumanBodyBones.RightFoot);
                float x=root.InverseTransformPoint(foot.position).x;
                return new Leg{thigh=thigh,knee=knee,foot=foot,side=Mathf.Sign(x),width=Mathf.Max(.24f,Mathf.Abs(x)),restFoot=Quaternion.Inverse(root.rotation)*foot.rotation};
            }
            legs=new[]{Create(true),Create(false)};
            lower=new[]{hips,legs[0].thigh,legs[0].knee,legs[0].foot,legs[1].thigh,legs[1].knee,legs[1].foot};
            lastRot=new Quaternion[lower.Length];fromRot=new Quaternion[lower.Length];
            lastPos=new Vector3[lower.Length];fromPos=new Vector3[lower.Length];
            Remember();
        }
        public void Reset()
        {
            active=false;gait=movementWeight=blendAge=exitAge=0;
            previousAttack=HulkController.Attack.None;
            foreach(var leg in legs){leg.planted=false;leg.phase=-1;leg.release=Vector3.zero;}
        }
        static float Ease(float t,float a,float b)=>Mathf.SmoothStep(0,1,Mathf.InverseLerp(a,b,t));
        void Remember()
        {
            for(int i=0;i<lower.Length;i++){lastRot[i]=lower[i].localRotation;lastPos[i]=lower[i].localPosition;}
        }
        public int Apply(Vector3 localVelocity,HulkController.Attack attack,float age,bool left,bool grounded,bool landed,float transformation,float dt)
        {
            dt=Mathf.Max(0,dt);
            bool transforming=transformation>=0;
            bool combat=attack==HulkController.Attack.Punch||attack==HulkController.Attack.Clap;
            bool controlled=transforming || combat&&grounded;
            if(!controlled)
            {
                // Ease lower joints back into the run/idle pose; airborne motion stays physically timed.
                if(active){exitAge=0;active=false;}
                if(attack==HulkController.Attack.None && !transforming && exitAge<.16f)
                {
                    exitAge+=dt;float t=Ease(exitAge,0,.16f);
                    for(int i=0;i<lower.Length;i++)
                    {lower[i].localRotation=Quaternion.Slerp(lastRot[i],lower[i].localRotation,t);lower[i].localPosition=Vector3.Lerp(lastPos[i],lower[i].localPosition,t);}
                }
                else Remember();
                foreach(var leg in legs)leg.planted=false;
                return 0;
            }
            bool entering=!active;
            if(entering)
            {
                for(int i=0;i<lower.Length;i++){fromRot[i]=lastRot[i];fromPos[i]=lastPos[i];}
                blendAge=0;movementWeight=0;active=true;
            }
            if(entering || attack!=previousAttack)
                foreach(var leg in legs){leg.planted=false;leg.phase=-1;leg.release=Vector3.zero;}
            previousAttack=attack;blendAge+=dt;
            float speed=new Vector2(localVelocity.x,localVelocity.z).magnitude;
            bool moving=!transforming&&speed>.15f;
            movementWeight=Mathf.MoveTowards(movementWeight,moving?1:0,dt*9);
            if(moving)gait+=speed*dt/1.7f;
            float scale=visual.lossyScale.y/HulkVisual.ModelScale;
            float side=left?-1:1;
            float load,strike,recover,twist,lowering,forward,shift;
            if(transforming)
            {
                load=Ease(transformation,0,.30f);strike=Ease(transformation,.30f,.76f);recover=Ease(transformation,.78f,1);
                twist=-8*load*(1-strike);lowering=.16f*load*(1-strike)+.025f*Mathf.Sin(transformation*Mathf.PI);
                forward=.025f*load;shift=.025f*Mathf.Sin(transformation*Mathf.PI*2);
            }
            else
            {
                bool punch=attack==HulkController.Attack.Punch;
                load=Ease(age,0,punch?.12f:.22f);strike=Ease(age,punch?.12f:.22f,punch?HulkController.PunchImpactTime:.43f);
                recover=Ease(age,punch?.39f:.54f,punch?HulkController.PunchDuration:.95f);
                twist=punch?side*(-10*load+22*strike)*(1-recover):3*Mathf.Sin(age*6)*(1-recover);
                lowering=(punch?.085f:.15f)*load*(1-recover)-(punch?.035f:.07f)*strike*(1-recover);
                forward=(-.045f*load+.14f*strike)*(1-recover);
                shift=punch?-side*.035f*load*(1-recover):0;
            }
            float bob=.025f*Mathf.Cos(gait*Mathf.PI*4)*movementWeight;
            hips.position=root.TransformPoint(new Vector3(restHip.x+shift,restHip.y-lowering-bob,restHip.z+forward)*scale);
            hips.rotation=Quaternion.AngleAxis(twist,root.up)*hips.rotation;
            int steps=0;
            foreach(var leg in legs)
            {
                bool lead=leg.side==-side;
                float step=transforming?Ease(transformation,.18f,.5f)*(1-Ease(transformation,.78f,1)):
                    (attack==HulkController.Attack.Punch?strike*(1-recover):Ease(age,.02f,.22f)*(1-recover));
                float heel=!transforming&&!lead?strike*(1-recover):0;
                float swing=!transforming&&lead?Mathf.Sin(Mathf.PI*Ease(age,.015f,attack==HulkController.Attack.Punch?.24f:.22f))*.08f:0;
                float returnSwing=!transforming&&lead?Mathf.Sin(Mathf.PI*recover)*.055f:0;
                float z=lead?.26f*step:-.11f*step;
                float spread=attack==HulkController.Attack.Clap?.055f*step:transforming?.045f*step:0;
                float ground=GroundY(root.position+root.right*leg.side*leg.width*scale);
                Vector3 target=root.position+root.right*leg.side*(leg.width+spread)*scale+root.forward*z*scale;
                target.y=ground+(.105f+swing+returnSwing+.055f*heel)*scale;
                Quaternion rotation=root.rotation*Quaternion.Euler(0,leg.side*9*step,0)*leg.restFoot;
                rotation=Quaternion.AngleAxis(18*heel,root.right)*rotation;
                if(movementWeight>0)
                {
                    float phase=Mathf.Repeat(gait+(leg.side>0?.5f:0),1);
                    Vector3 travel=root.TransformDirection(localVelocity).normalized;
                    if(travel.sqrMagnitude<.01f)travel=root.forward;
                    Vector3 walk=Step(leg,phase,travel,scale,moving,ref steps);
                    target=Vector3.Lerp(target,walk,movementWeight);
                    rotation=Quaternion.Slerp(rotation,root.rotation*leg.restFoot,movementWeight);
                }
                else{leg.planted=false;leg.phase=-1;}
                Solve(leg,target,root.forward);
                leg.foot.rotation=rotation;
            }
            // Smooth only the entry; phase changes and repeated punches keep their support continuity.
            float blend=transforming?1:Ease(blendAge,0,.10f);
            for(int i=0;i<lower.Length;i++)
            {
                lower[i].localRotation=Quaternion.Slerp(fromRot[i],lower[i].localRotation,blend);
                lower[i].localPosition=Vector3.Lerp(fromPos[i],lower[i].localPosition,blend);
            }
            Remember();return steps;
        }
        float GroundY(Vector3 point)
        {
            if(Physics.Raycast(point+Vector3.up*.7f,Vector3.down,out var hit,1.2f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)
                &&Mathf.Abs(hit.point.y-root.position.y)<.42f)return hit.point.y;
            return root.position.y;
        }
        Vector3 Step(Leg leg,float phase,Vector3 travel,float scale,bool moving,ref int steps)
        {
            const float stance=.6f,reach=.46f;
            bool support=phase<stance;float t=support?phase/stance:(phase-stance)/(1-stance);
            float z=support?Mathf.Lerp(reach,-reach,t):Mathf.Lerp(-reach,reach,Ease(t,0,1));
            Vector3 target=root.position+root.right*leg.side*leg.width*scale+travel*z*scale;
            target.y=GroundY(target)+.105f*scale;
            if(support&&moving)
            {
                if(!leg.planted||phase<leg.phase||Vector3.Distance(target,leg.contact)>.7f)
                {if(leg.phase>=stance||phase<leg.phase)steps++;leg.contact=target;leg.planted=true;}
                target=leg.contact;
            }
            else
            {
                if(leg.planted)
                {var release=root.position+root.right*leg.side*leg.width*scale-travel*reach*scale;release.y=GroundY(release)+.105f*scale;leg.release=leg.contact-release;leg.planted=false;}
                target+=leg.release*(1-Ease(t,0,1))+Vector3.up*Mathf.Sin(Mathf.PI*t)*.18f*scale;
            }
            leg.phase=phase;return target;
        }
        static void Solve(Leg leg,Vector3 target,Vector3 forward)
        {
            float a=Vector3.Distance(leg.thigh.position,leg.knee.position),b=Vector3.Distance(leg.knee.position,leg.foot.position);
            Vector3 delta=target-leg.thigh.position;float distance=Mathf.Clamp(delta.magnitude,Mathf.Abs(a-b)+.005f,a+b-.005f);
            Vector3 direction=delta.normalized,pole=Vector3.ProjectOnPlane(forward,direction).normalized;
            float along=(a*a-b*b+distance*distance)/(2*distance);
            Vector3 bend=leg.thigh.position+direction*along+pole*Mathf.Sqrt(Mathf.Max(0,a*a-along*along));
            leg.thigh.rotation=Quaternion.FromToRotation(leg.knee.position-leg.thigh.position,bend-leg.thigh.position)*leg.thigh.rotation;
            leg.knee.rotation=Quaternion.FromToRotation(leg.foot.position-leg.knee.position,leg.thigh.position+direction*distance-leg.knee.position)*leg.knee.rotation;
        }
    }
}
