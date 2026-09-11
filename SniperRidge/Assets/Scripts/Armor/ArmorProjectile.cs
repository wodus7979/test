using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    [DefaultExecutionOrder(320)]
    public sealed class ArmorProjectile : MonoBehaviour
    {
        const float Radius=.08f, Blast=7f;
        Vector3 velocity, origin;
        Transform owner;
        bool friendly, rocket, done;
        float damage, age;
        ParticleSystem smoke;
        static readonly RaycastHit[] hits=new RaycastHit[64];
        public static bool Cast(Vector3 from,Vector3 to,Transform ignore,out RaycastHit nearest)
        {
            nearest=default;
            Vector3 delta=to-from;float distance=delta.magnitude;
            if(distance<.0001f)return false;
            int count=Physics.SphereCastNonAlloc(from,Radius,delta/distance,hits,distance,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
            RaycastHit[] results=count==hits.Length?Physics.SphereCastAll(from,Radius,delta/distance,distance,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore):hits;
            if(results!=hits)count=results.Length;
            bool found=false;float best=distance+1;
            for(int i=0;i<count;i++)
            {
                var hit=results[i];
                if(ignore!=null && hit.collider.transform.IsChildOf(ignore))continue;
                if(hit.distance>=best)continue;
                nearest=hit;best=hit.distance;found=true;
            }
            return found;
        }
        public static bool Obstructed(Vector3 from,Vector3 to,Transform shooter,TankVehicle target)
        {
            return Cast(from,to,shooter,out var hit) && (target == null || hit.collider.GetComponentInParent<TankVehicle>() != target);
        }
        public static void Launch(Vector3 muzzle,Vector3 direction,Transform shooter,bool playerShot,float damage,float speed,bool rocket)
        {
            var go=new GameObject(rocket?"Enemy anti-tank rocket":"Tank shell");
            go.transform.SetPositionAndRotation(muzzle,Quaternion.LookRotation(direction));
            var shot=go.AddComponent<ArmorProjectile>();shot.owner=shooter;shot.friendly=playerShot;
            shot.damage=damage;shot.velocity=direction.normalized*speed;shot.origin=muzzle;shot.rocket=rocket;
            RocketEffects.BuildBody(go.transform);
            if(rocket)shot.smoke=RocketEffects.Trail(go.transform);
            // Check the barrel's whole reach, including objects penetrated by the displayed muzzle.
            var tank=shooter!=null?shooter.GetComponent<TankVehicle>():null;
            Vector3 breech=tank!=null?tank.AimPoint:shooter!=null?shooter.position+Vector3.up*1.5f:muzzle;
            Physics.SyncTransforms();
            if(Cast(breech,muzzle,shooter,out var obstruction))shot.Explode(obstruction.point,obstruction.normal,obstruction.collider);
            else
                foreach(var c in Physics.OverlapSphere(muzzle,Radius,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                    if(shooter==null||!c.transform.IsChildOf(shooter)){shot.Explode(muzzle,-direction,c);break;}
        }
        void LateUpdate()
        {
            var gm=GameManager.Instance;
            if(done||gm==null||!gm.IsPlaying){Destroy(gameObject);return;}
            Physics.SyncTransforms();age+=Time.deltaTime;
            if(age>8f){Destroy(gameObject);return;}
            Vector3 old=transform.position,next=old+velocity*Time.deltaTime;
            if(Cast(old,next,owner,out var hit)){Explode(hit.point,hit.normal,hit.collider);return;}
            transform.position=next;
            if(!rocket)Effects.Tracer(old,next,new Color(1,.80f,.4f),.06f,.075f);
        }
        void Explode(Vector3 point,Vector3 normal,Collider direct)
        {
            if(done)return;done=true;
            var gm=GameManager.Instance;Vector3 centre=point+normal*.12f;
            RocketEffects.Explosion(centre);gm.Armor.PlayExplosion(centre);
            bool counted=false;
            var directTank=direct!=null?direct.GetComponentInParent<TankVehicle>():null;
            foreach(var target in FindTankTargets(centre,damage,owner,friendly,directTank))
            {
                bool killed=target.Key.Damage(target.Value);
                if(friendly){gm.OnArmorHit(killed,!counted);counted=true;}
            }
            if(friendly)
            {
                var hitbox=direct!=null?direct.GetComponent<EnemyHitbox>():null;
                var targets=RocketProjectile.FindBlastTargets(centre,damage,hitbox!=null?hitbox.Owner:null);
                foreach(var target in targets)
                {
                    bool killed=target.Key.TakeHit(target.Value,false,(target.Key.transform.position-centre).normalized);
                    gm.OnEnemyHit(target.Key,false,Vector3.Distance(origin,centre),killed,!counted);counted=true;
                }
            }
            Destroy(gameObject);
        }
        public static Dictionary<TankVehicle,float> FindTankTargets(Vector3 centre,float maximum,Transform shooter,bool playerShot,TankVehicle direct=null)
        {
            var targets=new Dictionary<TankVehicle,float>();
            foreach(var c in Physics.OverlapSphere(centre,Blast,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
            {
                var tank=c.GetComponentInParent<TankVehicle>();
                if(tank==null || tank.IsDead || tank.IsPlayer==playerShot)continue;
                Vector3 closest=c.ClosestPoint(centre);
                if(Obstructed(centre,closest,shooter,tank))continue;
                float amount=maximum*Mathf.Lerp(1f,.15f,Mathf.Clamp01(Vector3.Distance(centre,closest)/Blast));
                if(!targets.TryGetValue(tank,out float previous) || amount>previous)targets[tank]=amount;
            }
            if(direct!=null && !direct.IsDead && direct.IsPlayer!=playerShot)targets[direct]=maximum;
            return targets;
        }
        void OnDestroy()
        {
            if(smoke==null)return;
            smoke.transform.SetParent(null,true);smoke.Stop(true,ParticleSystemStopBehavior.StopEmitting);Destroy(smoke.gameObject,2f);
        }
    }
}
