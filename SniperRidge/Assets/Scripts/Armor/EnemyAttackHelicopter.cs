using UnityEngine;

namespace SniperRidge
{
    public sealed class EnemyAttackHelicopter:MonoBehaviour
    {
        public bool Dead { get; private set; }
        public Vector3 Velocity { get; private set; }
        public int RocketsFired { get; private set; }
        public int BulletsFired { get; private set; }
        Transform rotor,tail,muzzle,rocket;
        TankBattle battle;
        int ordinal,health=3;
        float started,nextRocket,nextBurst,burstEnd,nextBullet;
        public static EnemyAttackHelicopter Create(TankBattle battle,int index)
        {
            var go=new GameObject("Enemy attack helicopter "+(index+1));var h=go.AddComponent<EnemyAttackHelicopter>();
            h.battle=battle;h.ordinal=index;h.started=Time.time;h.nextRocket=Time.time+7+index*3;h.nextBurst=Time.time+4+index*2;
            ArmoredReferenceVisual.Gunship(go.transform,out h.rotor,out h.tail,out h.muzzle,out h.rocket);
            var col=go.AddComponent<BoxCollider>();col.center=new Vector3(0,.3f,-1.3f);col.size=new Vector3(4.5f,3.5f,10.5f);
            go.transform.position=h.FlightPoint(0);
            var sound=go.AddComponent<AudioSource>();sound.clip=Resources.Load<AudioClip>("Audio/helicopter_rotor");sound.loop=true;sound.spatialBlend=1;sound.volume=.22f;sound.minDistance=20;sound.maxDistance=160;if(sound.clip)sound.Play();
            return h;
        }
        Vector3 FlightPoint(float time)
        {
            float a=ordinal*Mathf.PI*2/3+time*.055f;var center=battle.TargetPosition;
            var p=center+new Vector3(Mathf.Cos(a)*38,0,Mathf.Sin(a)*38);
            p.x=Mathf.Clamp(p.x,-TankBattle.Bounds+8,TankBattle.Bounds-8);p.z=Mathf.Clamp(p.z,-TankBattle.Bounds+8,TankBattle.Bounds-8);
            p.y=Mathf.Max(center.y,TerrainGenerator.GroundHeight(GameManager.Instance.Terrain,p.x,p.z))+18+ordinal*3+Mathf.Sin(time*.5f);return p;
        }
        void Update()
        {
            var gm=GameManager.Instance;if(Dead||!gm||!gm.IsPlaying)return;
            Vector3 previous=transform.position,desired=FlightPoint(Time.time-started);
            transform.position=Vector3.MoveTowards(previous,desired,6f*Time.deltaTime);
            Velocity=(transform.position-previous)/Mathf.Max(.001f,Time.deltaTime);
            var flat=Vector3.ProjectOnPlane(battle.TargetPoint-transform.position,Vector3.up);
            if(flat.sqrMagnitude>.1f)transform.rotation=Quaternion.Slerp(transform.rotation,Quaternion.LookRotation(flat)*Quaternion.Euler(4,0,Mathf.Sin(Time.time*.6f)*3),Time.deltaTime*2);
            rotor.Rotate(0,Time.deltaTime*1350,0,Space.Self);tail.Rotate(Time.deltaTime*1800,0,0,Space.Self);
            if(!battle.TargetAvailable)return;
            if(Time.time>=nextRocket)
            {
                nextRocket=Time.time+10+ordinal;RocketsFired++;
                gm.Hud.WarnIncoming(transform.position,1.3f,"공격 헬기 로켓");
                ArmorProjectile.Launch(rocket.position,(battle.TargetPoint-rocket.position).normalized,transform,false,65,42,true);
                RocketEffects.CannonMuzzle(rocket.position,rocket.forward);
            }
            if(Time.time>=nextBurst){nextBurst=Time.time+7.5f;burstEnd=Time.time+.8f;}
            if(Time.time<burstEnd&&Time.time>=nextBullet)
            {
                nextBullet=Time.time+.12f;BulletsFired++;Vector3 target=battle.TargetPoint+Random.insideUnitSphere*1.6f;
                bool obstruction=ArmorProjectile.Cast(muzzle.position,target,transform,out var hit);
                Effects.Tracer(muzzle.position,obstruction?hit.point:target,new Color(1,.65f,.28f),.045f,.13f);
                Effects.Flash(muzzle.position,new Color(1,.6f,.2f),2,4,.04f);
                if(battle.Rampage.Escaped)
                {
                    gm.Player.GetDamageCapsule(out var bottom,out var top);
                    float d=CounterfireRules.CapsuleHit(muzzle.position,target,bottom,top,gm.Player.DamageRadius);
                    if(!float.IsPositiveInfinity(d)&&(!obstruction||d<hit.distance))gm.Health.TakeDamage(3);
                }
                else if(obstruction&&hit.collider.GetComponentInParent<TankVehicle>()==battle.PlayerTank)battle.PlayerTank.Damage(2);
            }
        }
        public bool Hit(int amount)
        {
            if(Dead)return false;health-=amount;Effects.Dust(transform.position,Vector3.up,.6f);
            if(health>0)return false;Dead=true;
            GetComponent<TankAppearanceDetail>().Burn();RocketEffects.TankDestruction(transform,true);
            foreach(var c in GetComponentsInChildren<Collider>())c.enabled=false;
            var audio=GetComponent<AudioSource>();if(audio)audio.Stop();
            gameObject.AddComponent<AttackHelicopterWreck>();Destroy(gameObject,16);
            GameManager.Instance.AddScore(900);GameManager.Instance.Hud.ShowShotFeedback("공격 헬기 격추! +900");return true;
        }
    }
    public sealed class AttackHelicopterWreck:MonoBehaviour
    {
        float speed;
        void Update()
        {
            var gm=GameManager.Instance;if(!gm||!gm.IsPlaying)return;
            float ground=TerrainGenerator.GroundHeight(gm.Terrain,transform.position.x,transform.position.z)+1.5f;
            if(transform.position.y<=ground){enabled=false;RocketEffects.Explosion(transform.position,2);return;}
            speed+=9.8f*Time.deltaTime;transform.position+=Vector3.down*speed*Time.deltaTime;transform.Rotate(20*Time.deltaTime,45*Time.deltaTime,20*Time.deltaTime,Space.Self);
        }
    }
}
