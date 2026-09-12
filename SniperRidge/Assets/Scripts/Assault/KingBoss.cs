using System.Collections;
using UnityEngine;

namespace SniperRidge
{
    public sealed class BossArmor
    {
        public float Remaining { get; private set; }
        public BossArmor(float amount){Remaining=Mathf.Max(0,amount);}
        public float Apply(float damage,bool headshot)
        {
            damage=Mathf.Max(0,damage);
            if(Remaining<=0)return damage*(headshot?1.8f:1f);
            float absorbed=Mathf.Min(Remaining,damage*.8f);Remaining-=absorbed;
            return damage-absorbed;
        }
    }

    // Finite armour, readable attack windups and fixed aim: movement and solid cover evade shots.
    public sealed class KingBoss:MonoBehaviour
    {
        public const float MaximumHealth=1800f,MaximumArmor=1200f;
        public readonly BossArmor Armor=new BossArmor(MaximumArmor);
        public EnemySoldier Soldier { get; private set; }
        public bool Engaged { get; private set; }
        public bool IsAttacking { get; private set; }
        public string Action { get; private set; }="요새에서 대기 중";
        public Vector3 MoveTarget { get; private set; }
        public bool Enraged=>Armor.Remaining<=0;
        GameManager game;Vector3 anchor;Transform equipment,launcherTip;GameObject chestPlate;
        Material armorMaterial,clothMaterial;float nextAttack;int attacks;

        public static KingBoss Attach(EnemySoldier soldier,GameManager game)
        {
            var boss=soldier.gameObject.AddComponent<KingBoss>();boss.Soldier=soldier;boss.game=game;
            boss.anchor=boss.MoveTarget=soldier.transform.position;soldier.name="북부 요새의 왕";
            soldier.ConfigureBoss(boss);soldier.Combat.DefensePoint=boss.anchor;boss.BuildEquipment();return boss;
        }
        public float AbsorbHit(float damage,bool headshot)
        {
            Engage();bool intact=!Enraged;float healthDamage=Armor.Apply(damage,headshot);
            if(intact&&Enraged)
            {
                chestPlate.SetActive(false);game.Hud.Announce("왕의 방어구 파괴! · 머리를 노리세요");
                Effects.Puff(Soldier.AimPoint,Vector3.up,.55f,new Color(.7f,.52f,.18f),.5f);
            }
            return healthDamage;
        }
        void Engage()
        {
            if(Engaged)return;Engaged=true;nextAttack=Time.time+2f;
            game.Hud.Announce("왕 출현 · 로켓 경고 후 이동하거나 엄폐하세요");
        }
        void Update()
        {
            if(Soldier==null||Soldier.IsDead||game==null||!game.IsPlaying)return;
            if(Vector3.Distance(transform.position,game.Player.transform.position)<65f)Engage();
            if(!Engaged||IsAttacking||Time.time<nextAttack)return;
            if(!Soldier.Combat.CanShoot){Action="목표 탐색 중";return;}
            StartCoroutine(Attack(attacks++%3==2));
        }
        IEnumerator Attack(bool rocket)
        {
            IsAttacking=true;
            Vector3 target=rocket?game.Player.transform.position+Vector3.up*.25f:game.Player.AimPoint;
            float warning=rocket?1.8f:.85f;Action=rocket?"로켓 조준 — 옆으로 피하세요":"기관총 조준 — 엄폐하세요";
            Vector3 origin=rocket?launcherTip.position:Soldier.Muzzle;
            game.Hud.WarnIncoming(origin,warning+(rocket?Vector3.Distance(origin,target)/55f:.4f),rocket?"왕 · 로켓":"왕 · 기관총");
            if(rocket)Effects.Tracer(origin,target,new Color(1,.28f,.07f,.7f),warning,.018f);
            yield return new WaitForSeconds(warning);
            if(!CanContinue()){IsAttacking=false;yield break;}
            Action=rocket?"로켓 발사":"기관총 연사";
            if(rocket)
            {
                InfantryRocket.Launch(Soldier,launcherTip.position,target);
                Effects.Flash(launcherTip.position,new Color(1,.55f,.15f),4,8,.10f);
                game.PlaySound(game.Sounds.RocketLaunch,.65f);Soldier.BossRecoil();
            }
            else
            {
                for(int i=0;i<(Enraged?8:6);i++)
                {
                    if(!CanContinue())break;
                    // All rounds use the position saved before the warning, never track a dodging player.
                    Vector3 aim=target+Random.insideUnitSphere*.28f;
                    EnemyProjectile.Launch(game,Soldier,Soldier.Muzzle,aim,Enraged?11f:9f);
                    Effects.Flash(Soldier.Muzzle,new Color(1,.8f,.4f),4,6,.045f);Soldier.BossRecoil();
                    game.StartCoroutine(game.EnemyShotSound(Soldier.Muzzle,"lmg"));
                    yield return new WaitForSeconds(.13f);
                }
            }
            IsAttacking=false;Action=Enraged?"방어구 파괴 · 공격 속도 증가":"재장전 · 공격 기회";
            MoveTarget=anchor+new Vector3(attacks%2==0?-2.3f:2.3f,0,-1.2f);
            nextAttack=Time.time+(Enraged?1.5f:2.8f);
        }
        bool CanContinue()=>Soldier!=null&&!Soldier.IsDead&&game!=null&&game.IsPlaying;
        void BuildEquipment()
        {
            equipment=new GameObject("Royal armour and shoulder launcher").transform;equipment.SetParent(transform,false);
            armorMaterial=SurfaceDetail.Make(Surface.PaintedMetal,new Color(.38f,.28f,.12f),.18f);
            clothMaterial=SurfaceDetail.Make(Surface.Fabric,new Color(.24f,.025f,.03f),0);
            chestPlate=Piece("Royal breastplate",new Vector3(0,-.1f,.14f),new Vector3(.52f,.52f,.14f),armorMaterial,true);
            Piece("Left shoulder plate",new Vector3(-.32f,.1f,0),new Vector3(.24f,.14f,.3f),armorMaterial,true);
            Piece("Royal red back cloth",new Vector3(0,-.28f,-.22f),new Vector3(.62f,.83f,.055f),clothMaterial,false);
            for(int i=-2;i<=2;i++)Piece("Crown crest",new Vector3(i*.065f,.72f,.07f),new Vector3(.045f,.10f+(2-Mathf.Abs(i))*.025f,.08f),armorMaterial,false);
            var prefab=WeaponModels.LoadPrefab("launcher_reusable");
            if(prefab!=null)
            {
                var launcher=Instantiate(prefab,equipment,false);launcher.name="King shoulder rocket launcher";
                launcher.transform.localPosition=new Vector3(.34f,.13f,-.05f);launcher.transform.localScale=Vector3.one*.75f;
                foreach(var collider in launcher.GetComponentsInChildren<Collider>()){collider.enabled=false;Destroy(collider);}
                launcherTip=WeaponModels.FindMuzzle(launcher);
            }
            if(launcherTip==null)
            {
                launcherTip=new GameObject("Rocket muzzle").transform;launcherTip.SetParent(equipment,false);launcherTip.localPosition=new Vector3(.34f,.13f,.55f);
            }
        }
        GameObject Piece(string name,Vector3 position,Vector3 size,Material material,bool hitbox)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube);go.name=name;go.transform.SetParent(equipment,false);
            go.transform.localPosition=position;go.transform.localScale=size;go.GetComponent<Renderer>().sharedMaterial=material;
            if(hitbox)go.AddComponent<EnemyHitbox>().Owner=Soldier;
            else {go.GetComponent<Collider>().enabled=false;Destroy(go.GetComponent<Collider>());}
            return go;
        }
        void LateUpdate()
        {
            if(equipment==null||Soldier.Head==null)return;
            equipment.position=Soldier.Head.position-Vector3.up*.65f;
            equipment.rotation=Soldier.IsDead?Soldier.Head.rotation:transform.rotation;
        }
        void OnDestroy(){if(armorMaterial!=null)Destroy(armorMaterial);if(clothMaterial!=null)Destroy(clothMaterial);}
    }
}
