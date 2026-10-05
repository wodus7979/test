using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    // Mixamo supplies joint motion; the scene owns a swept, directional flight path.
    [DefaultExecutionOrder(170)]
    public sealed class EnemyPropKnockback : MonoBehaviour
    {
        public const float FallDuration=2.1f, FlightDuration=.85f, RecoveryDuration=1.6f;
        public float Age { get; private set; }
        EnemySoldier owner;
        EnemyAnimationRig rig;
        Transform weapon;
        Animator animator;
        AnimationClip fall,getUp;
        NavMeshAgent agent;
        bool agentWasEnabled,landed;
        Vector3 direction,velocity;
        readonly List<MonoBehaviour> suspended=new List<MonoBehaviour>();
        Transform[] bones;
        Vector3[] positions;
        Quaternion[] rotations;

        public static void Begin(EnemySoldier owner,EnemyAnimationRig rig,Transform weapon,Vector3 direction)
        {
            if(owner.GetComponent<EnemyPropKnockback>())return;
            var clip=Resources.Load<AnimationClip>("Enemies/PropKnockback");
            if(!clip)return;
            var reaction=owner.gameObject.AddComponent<EnemyPropKnockback>();
            reaction.owner=owner;reaction.rig=rig;reaction.weapon=weapon;reaction.fall=clip;
            reaction.getUp=Resources.Load<AnimationClip>("Enemies/TankGetUp");
            reaction.direction=Vector3.ProjectOnPlane(direction,Vector3.up).normalized;
            if(reaction.direction.sqrMagnitude<.1f)reaction.direction=-owner.transform.forward;
            reaction.velocity=reaction.direction*(owner.Boss?4.5f:10f);
            reaction.agent=owner.GetComponent<NavMeshAgent>();
            reaction.agentWasEnabled=reaction.agent&&reaction.agent.enabled;
            owner.InterruptForProp();
            foreach(var behaviour in owner.GetComponentsInChildren<MonoBehaviour>())
                if(behaviour!=reaction&&behaviour.enabled){reaction.suspended.Add(behaviour);behaviour.StopAllCoroutines();behaviour.enabled=false;}
            reaction.animator=rig.GetComponent<Animator>();reaction.animator.enabled=false;
            if(reaction.agent)reaction.agent.enabled=false;
            reaction.bones=rig.GetComponentsInChildren<Transform>();reaction.CapturePose();
            if(weapon)weapon.gameObject.SetActive(true);
        }
        void CapturePose()
        {
            positions=new Vector3[bones.Length];rotations=new Quaternion[bones.Length];
            for(int i=0;i<bones.Length;i++){positions[i]=bones[i].localPosition;rotations[i]=bones[i].localRotation;}
        }
        void Sample(AnimationClip clip,float progress,float blend)
        {
            clip.SampleAnimation(rig.gameObject,Mathf.Clamp01(progress)*clip.length);
            for(int i=0;i<bones.Length;i++)
            {bones[i].localPosition=Vector3.Lerp(positions[i],bones[i].localPosition,blend);bones[i].localRotation=Quaternion.Slerp(rotations[i],bones[i].localRotation,blend);}
        }
        public static float Ground(Vector3 point,Transform ignore,float fallback)
        {
            float nearest=float.PositiveInfinity,result=fallback;
            foreach(var hit in Physics.RaycastAll(point+Vector3.up*2,Vector3.down,250,Physics.DefaultRaycastLayers,QueryTriggerInteraction.Ignore))
            {
                if(hit.transform.IsChildOf(ignore)||hit.collider.GetComponentInParent<EnemySoldier>()||hit.collider.GetComponentInParent<SniperController>())continue;
                if(hit.distance<nearest&&hit.normal.y>.45f){nearest=hit.distance;result=hit.point.y;}
            }
            return result;
        }
        void LateUpdate()
        {
            float previous=Age;Age+=Time.deltaTime;
            if(previous<FlightDuration)
            {
                float dt=Mathf.Min(Time.deltaTime,FlightDuration-previous);
                Vector3 move=velocity*dt;float distance=move.magnitude;
                if(distance>0)
                {
                    foreach(var hit in Physics.CapsuleCastAll(transform.position+Vector3.up*.4f,transform.position+Vector3.up*1.3f,.3f,direction,distance+.06f,Physics.DefaultRaycastLayers,QueryTriggerInteraction.Ignore))
                    {
                        if(hit.transform.IsChildOf(transform)||hit.collider.GetComponentInParent<EnemySoldier>())continue;
                        distance=Mathf.Min(distance,Mathf.Max(0,hit.distance-.06f));velocity=Vector3.zero;
                    }
                    transform.position+=direction*distance;
                }
                float t=Mathf.Clamp01(Age/FlightDuration),old=Mathf.Clamp01(previous/FlightDuration);
                // Subtract the preceding arc before querying the supporting surface.
                Vector3 p=transform.position-Vector3.up*(4*1.35f*old*(1-old));
                p.y=Ground(p,transform,owner.GroundHeight(p.x,p.z))+.02f+4*1.35f*t*(1-t);transform.position=p;
            }
            Sample(fall,Age/FallDuration,Mathf.SmoothStep(0,1,Age/.1f));
            if(Age>=FlightDuration&&!landed){landed=true;Effects.Dust(transform.position,Vector3.up,.8f);}
            if(!owner.IsDead)rig.RefreshImpactHitboxes();
            if(Age<FallDuration)return;
            if(owner.IsDead)
            {
                EnemyRagdoll.Begin(rig.transform,transform,weapon,Vector3.zero,Vector3.zero,false);
                Destroy(this);return;
            }
            if(previous<FallDuration)CapturePose();
            if(getUp)Sample(getUp,(Age-FallDuration)/RecoveryDuration,Mathf.SmoothStep(0,1,(Age-FallDuration)/.2f));
            if(Age<FallDuration+RecoveryDuration)return;
            if(agentWasEnabled&&agent&&NavMesh.SamplePosition(transform.position,out var ground,2,NavMesh.AllAreas))
            {transform.position=ground.position;agent.enabled=true;agent.Warp(ground.position);}
            rig.RefreshImpactHitboxes();
            animator.enabled=true;animator.Play("Locomotion",0,0);animator.Update(0);
            foreach(var behaviour in suspended)if(behaviour)behaviour.enabled=true;
            Destroy(this);
        }
    }
}
