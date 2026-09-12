using UnityEngine;

namespace SniperRidge
{
    public sealed class InfantryRocket:MonoBehaviour
    {
        EnemySoldier shooter;
        Vector3 position,direction;
        float age;
        LineRenderer trail;
        public static void Launch(EnemySoldier owner,Vector3 from,Vector3 target)
        {
            foreach(var collider in Physics.OverlapSphere(from,.025f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                if(!collider.transform.IsChildOf(owner.transform))return;
            if(owner.Combat!=null)owner.Combat.RecordShot();
            var go=new GameObject("Infantry rocket");var rocket=go.AddComponent<InfantryRocket>();
            rocket.shooter=owner;rocket.position=from;rocket.direction=(target-from).normalized;go.transform.position=from;
            rocket.trail=go.AddComponent<LineRenderer>();rocket.trail.positionCount=2;
            rocket.trail.startWidth=.14f;rocket.trail.endWidth=.05f;rocket.trail.sharedMaterial=Effects.Unlit(new Color(1f,.55f,.15f));
            rocket.trail.SetPosition(0,from);rocket.trail.SetPosition(1,from);
        }
        void LateUpdate()
        {
            var gm=GameManager.Instance;
            if(gm==null||!gm.IsPlaying){Destroy(gameObject);return;}
            age+=Time.deltaTime;if(age>6){Destroy(gameObject);return;}
            var next=position+direction*55f*Time.deltaTime;
            bool wall=EnemyProjectile.WorldHit(position,next,shooter,out var hit);
            if(shooter!=null&&!shooter.IsAlly)
            {
                gm.Player.GetDamageCapsule(out var bottom,out var top);
                float distance=CounterfireRules.CapsuleHit(position,next,bottom,top,CounterfireRules.PlayerRadius);
                if(!float.IsPositiveInfinity(distance)&&(!wall||distance<hit.distance))
                {Explode(position+direction*distance);return;}
            }
            if(wall){Explode(hit.point+hit.normal*.1f);return;}
            trail.SetPosition(0,next-direction*2f);trail.SetPosition(1,next);position=next;transform.position=position;
        }
        void Explode(Vector3 centre)
        {
            var gm=GameManager.Instance;bool friendly=shooter!=null&&shooter.IsAlly;
            RocketEffects.Explosion(centre);gm.PlaySound(gm.Sounds.RocketExplosion,.6f);
            foreach(var target in RocketProjectile.FindBlastTargets(centre,65f))
                if(target.Key.IsAlly!=friendly)target.Key.TakeHit(target.Value,false,(target.Key.AimPoint-centre).normalized);
            float distance=Vector3.Distance(centre,gm.Player.AimPoint);
            if(!friendly && distance<RocketProjectile.BlastRadius &&
                !EnemyProjectile.WorldHit(centre,gm.Player.AimPoint,shooter,out _))
                gm.Health.TakeDamage(RocketProjectile.BlastDamage(distance,55f));
            Destroy(gameObject);
        }
    }
}
