using UnityEngine;

namespace SniperRidge
{
    [DefaultExecutionOrder(310)]
    public sealed class RampageThrownObject:MonoBehaviour
    {
        Vector3 velocity;
        TankVehicle ignoredTank;
        bool wholeTank,done;
        float age;
        int damage;
        public static void Launch(GameObject go,Vector3 direction,float speed,int hits,TankVehicle source,bool whole=false)
        {
            go.transform.SetParent(null,true);
            foreach(var c in go.GetComponentsInChildren<Collider>())c.enabled=false;
            var body=go.GetComponent<Rigidbody>();if(body)body.isKinematic=true;
            var projectile=go.AddComponent<RampageThrownObject>();projectile.velocity=direction.normalized*speed;
            projectile.damage=hits;projectile.ignoredTank=source;projectile.wholeTank=whole;
        }
        void LateUpdate()
        {
            if(done)return;
            var gm=GameManager.Instance;if(!gm||!gm.IsPlaying){Destroy(gameObject);return;}
            float dt=Time.deltaTime;age+=dt;Vector3 from=transform.position+Vector3.up*.5f;
            velocity+=Vector3.down*(wholeTank?15:10)*dt;Vector3 next=from+velocity*dt;
            float distance=(next-from).magnitude;RaycastHit closest=default;float best=distance+1;
            foreach(var h in Physics.SphereCastAll(from,wholeTank?1.4f:.65f,velocity.normalized,distance,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
            {
                if(h.collider.transform.IsChildOf(transform)||ignoredTank&&h.collider.GetComponentInParent<TankVehicle>()==ignoredTank)continue;
                if(h.distance<best){best=h.distance;closest=h;}
            }
            if(closest.collider){Impact(closest);return;}
            transform.position=next-Vector3.up*.5f;transform.Rotate(Vector3.right,dt*(wholeTank?140:260),Space.Self);
            if(age>7||transform.position.y<-40){if(wholeTank&&ignoredTank&&!ignoredTank.IsDead)ignoredTank.HeroHit(ignoredTank.RemainingShellHits);Destroy(gameObject);}
        }
        void Impact(RaycastHit hit)
        {
            done=true;var gm=GameManager.Instance;
            var soldier=hit.collider.GetComponentInParent<EnemyHitbox>();
            if(soldier&&soldier.Owner&&!soldier.Owner.IsDead)
            {
                bool killed=soldier.Owner.TakeHit(250,false,velocity.normalized,true);
                gm.OnEnemyHit(soldier.Owner,false,Vector3.Distance(gm.Player.transform.position,hit.point),killed,false);
            }
            var tank=hit.collider.GetComponentInParent<TankVehicle>();if(tank&&!tank.IsPlayer&&!tank.IsDead)tank.HeroHit(damage);
            var heli=hit.collider.GetComponentInParent<EnemyAttackHelicopter>();if(heli)heli.Hit(damage);
            if(wholeTank&&ignoredTank&&!ignoredTank.IsDead)ignoredTank.HeroHit(ignoredTank.RemainingShellHits);
            if(tank||heli||wholeTank)RocketEffects.Explosion(hit.point,1.5f);else Effects.Puff(hit.point,hit.normal,1.6f,new Color(.40f,.35f,.29f),.85f);
            gm.PlaySound(gm.Sounds.RocketExplosion,.5f);
            transform.position=hit.point+Vector3.up*.4f;
            Destroy(gameObject,wholeTank?16:5);
        }
    }
}
