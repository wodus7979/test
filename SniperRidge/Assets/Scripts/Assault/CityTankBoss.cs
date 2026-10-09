using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    // An armoured roadblock belongs to city progression, not the separate tank mission.
    public sealed class CityTankBoss:MonoBehaviour
    {
        public const float MaximumHealth=1400f;
        public float Health { get; private set; }=MaximumHealth;
        public bool IsDead=>Health<=0;
        public bool Engaged { get; private set; }
        public string Action { get; private set; }="중앙 도로 방어 중";
        public Vector3 AimPoint=>transform.position+Vector3.up*1.8f;
        GameManager gm; Transform turret,muzzle; Collider[] hull; TankAppearanceDetail finish;
        float nextShot,fireAt; bool aiming;Vector3 aim;readonly HashSet<int> heroAttacks=new HashSet<int>();
        public static CityTankBoss Create(GameManager game,Vector3 point)
        {
            var prefab=Resources.Load<GameObject>(TankVehicle.OppositionResource);
            var go=Instantiate(prefab,point,Quaternion.Euler(0,180,0));go.name="중간 보스 · 북부 요새 방어 전차";
            var tank=go.AddComponent<CityTankBoss>();tank.gm=game;
            tank.turret=go.transform.Find("Turret");tank.muzzle=tank.turret.Find("Barrel/Muzzle");
            tank.hull=go.GetComponentsInChildren<Collider>();
            tank.finish=go.AddComponent<TankAppearanceDetail>();tank.finish.Initialize(new Color(.31f,.34f,.20f));
            var obstacle=go.AddComponent<NavMeshObstacle>();obstacle.shape=NavMeshObstacleShape.Box;
            obstacle.center=new Vector3(0,1.2f,0);obstacle.size=new Vector3(3.8f,2.4f,7);obstacle.carving=true;
            tank.nextShot=Time.time+4;return tank;
        }
        void Update()
        {
            if(!gm||!gm.IsPlaying||IsDead)return;
            Vector3 target=gm.Player.AimPoint;float range=Vector3.Distance(AimPoint,target);
            bool visible=range<65&&!Blocked(AimPoint,target);
            if(visible)Engaged=true;
            Vector3 direction=(aiming?aim:target)-turret.position;direction.y=0;
            if(direction.sqrMagnitude>.1f)turret.rotation=Quaternion.RotateTowards(turret.rotation,Quaternion.LookRotation(direction),45*Time.deltaTime);
            if(aiming)
            {
                if(Time.time<fireAt)return;
                aiming=false;nextShot=Time.time+3.5f;Action="주포 재장전 · 접근해서 공격하세요";
                CityTankShell.Launch(gm,muzzle.position,(aim-muzzle.position).normalized,transform);
                CombatVfx.MuzzleFlash(muzzle.position,aim-muzzle.position,2.6f);gm.PlaySound(gm.Sounds.RocketExplosion,.65f,.8f);
            }
            else if(visible&&Time.time>=nextShot)
            {aim=target;aiming=true;fireAt=Time.time+1.25f;Action="주포 조준 중 · 옆으로 피하세요";gm.Hud.Announce("중간 보스 전차 · 주포 조준! 엄폐하거나 옆으로 이동");}
        }
        bool Blocked(Vector3 from,Vector3 to)
        {
            foreach(var hit in Physics.RaycastAll(from,(to-from).normalized,Vector3.Distance(from,to),EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
                if(!hit.transform.IsChildOf(transform)&&hit.collider.GetComponentInParent<SniperController>()==null)return true;
            return false;
        }
        Vector3 Closest(Vector3 p)
        {
            Vector3 closest=AimPoint;float best=float.MaxValue;
            foreach(var c in hull)if(c&&c.enabled){Vector3 q=c.ClosestPoint(p);float d=(q-p).sqrMagnitude;if(d<best){best=d;closest=q;}}
            return closest;
        }
        public bool Blast(Vector3 point,float damage)
        {
            if(IsDead)return false;Vector3 nearest=Closest(point);float distance=Vector3.Distance(point,nearest);
            if(distance>RocketProjectile.BlastRadius||Blocked(point,nearest))return false;
            Damage(damage*Mathf.Lerp(1,.2f,distance/RocketProjectile.BlastRadius));return true;
        }
        public void HeroHit(Vector3 origin,Vector3 forward,float range,float angle,float damage,int serial)
        {
            if(IsDead||heroAttacks.Contains(serial))return;Vector3 p=Closest(origin),delta=p-origin;
            if(delta.magnitude>range||Vector3.Angle(forward,Vector3.ProjectOnPlane(delta,Vector3.up))>angle||Blocked(origin,p))return;
            heroAttacks.Add(serial);Damage(damage);Effects.Dust(p,-forward,1);
        }
        public void Damage(float amount)
        {
            if(IsDead||!gm.IsPlaying||amount<=0)return;Engaged=true;Health=Mathf.Max(0,Health-amount);
            gm.Hud.ShowShotFeedback("중간 보스 장갑 명중 · 내구도 "+Mathf.CeilToInt(Health));
            if(!IsDead)return;
            aiming=false;finish.Burn();RocketEffects.TankDestruction(transform);gm.PlaySound(gm.Sounds.RocketExplosion,1);
            gm.AddScore(1000);gm.Player.ResupplyCombat(120,180,20,4);
            gm.Hud.Announce("중간 보스 전차 격파 +1000 · 탄약 확보 · 북부 요새로 전진");
            // Wreck remains solid, with side streets still available around it.
        }
    }
    public sealed class CityTankShell:MonoBehaviour
    {
        GameManager gm;Transform owner;Vector3 velocity;float age;
        public static void Launch(GameManager game,Vector3 position,Vector3 direction,Transform owner)
        {
            var go=new GameObject("City boss incoming shell");go.transform.SetPositionAndRotation(position,Quaternion.LookRotation(direction));
            var shell=go.AddComponent<CityTankShell>();shell.gm=game;shell.owner=owner;shell.velocity=direction*48;
            RocketEffects.BuildBody(go.transform);RocketEffects.Exhaust(go.transform);
        }
        void Update()
        {
            if(!gm||!gm.IsPlaying||(age+=Time.deltaTime)>6){Destroy(gameObject);return;}
            Vector3 from=transform.position,to=from+velocity*Time.deltaTime;bool wall=ArmorProjectile.Cast(from,to,owner,out var hit);
            gm.Player.GetDamageCapsule(out var bottom,out var top);
            float playerHit=CounterfireRules.CapsuleHit(from,to,bottom,top,gm.Player.DamageRadius);
            bool direct=!float.IsPositiveInfinity(playerHit)&&(!wall||playerHit<hit.distance);
            if(!wall&&!direct){Effects.Tracer(from,to,new Color(1,.65f,.18f),.12f,.1f);transform.position=to;return;}
            Vector3 p=direct?from+velocity.normalized*playerHit:hit.point+hit.normal*.2f;
            RocketEffects.Explosion(p,1.4f);gm.PlaySound(gm.Sounds.RocketExplosion,.8f);
            float d=Vector3.Distance(p,gm.Player.AimPoint);
            if(direct||(d<6&&!Physics.Linecast(p,gm.Player.AimPoint,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)))gm.Health.TakeDamage(direct?42:Mathf.Lerp(35,5,d/6));
            Destroy(gameObject);
        }
    }
}
