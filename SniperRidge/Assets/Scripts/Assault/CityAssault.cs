using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    public sealed class CityAssault:MonoBehaviour
    {
        public readonly AssaultProgress Progress=new AssaultProgress();
        public readonly List<EnemySoldier> Soldiers=new List<EnemySoldier>();
        readonly List<EnemySoldier> allies=new List<EnemySoldier>();
        public KingBoss King { get; private set; }
        int defeated;
        GameManager gm;
        float nextReinforcement;
        bool spawning;
        int ordinal;
        public int Alive {get {int n=0;foreach(var e in Soldiers)if(e!=null&&!e.IsDead&&!allies.Contains(e))n++;return n;}}
        public int AlliesAlive {get {int n=0;foreach(var e in allies)if(e!=null&&!e.IsDead)n++;return n;}}
        public Vector3 Objective=>King!=null?King.transform.position:AssaultLayout.BossPosition;
        Vector3 Frontline=>new Vector3(0,AssaultLayout.Ground,AssaultLayout.Objectives[Progress.Sector].z);
        public float Distance=>Vector3.Distance(gm.Player.transform.position,Objective);
        public string ObjectiveName=>"북부 요새의 왕";
        public string SquadStatus
        {
            get {var text="동료 ";for(int i=0;i<allies.Count;i++)text+=(i+1)+":"+(allies[i]!=null&&!allies[i].IsDead?Mathf.CeilToInt(allies[i].Health)+"%":"전사")+"  ";return text;}
        }
        public static CityAssault Create(GameManager game)
        {
            var battle=new GameObject("King assault and squad").AddComponent<CityAssault>();battle.gm=game;
            if(!NavMesh.SamplePosition(AssaultLayout.BossPosition,out var kingPoint,2f,NavMesh.AllAreas))throw new System.InvalidOperationException("왕의 전투 구역 경로 누락");
            var king=LevelBuilder.SpawnAssaultSoldier(game,kingPoint.position,false,900,EnemyRole.MachineGunner);
            battle.Soldiers.Add(king);battle.King=KingBoss.Attach(king,game);
            for(int i=0;i<4;i++)
            {
                Vector3 point=AssaultLayout.Start+new Vector3((i-1.5f)*1.8f,0,-3f-(i%2)*1.5f);
                if(!NavMesh.SamplePosition(point,out var nav,3f,NavMesh.AllAreas))throw new System.InvalidOperationException("동료 시작 경로 누락");
                var role=i==2?EnemyRole.Sniper:i==3?EnemyRole.RocketTrooper:EnemyRole.MachineGunner;
                var ally=LevelBuilder.SpawnAssaultSoldier(game,nav.position,false,i,role,true);
                ally.name="동료 "+(i+1);battle.allies.Add(ally);battle.Soldiers.Add(ally);
            }
            battle.Guards();battle.nextReinforcement=Time.time+6f;battle.StartCoroutine(battle.CheckAfterStart());return battle;
        }
        void Update()
        {
            if(!gm.IsPlaying)return;
            if(Progress.Complete){gm.CompleteAssault();return;}
            if(Progress.Advance(gm.Player.transform.position))
            {
                gm.Hud.Announce("북부 요새로 전진 · 왕까지 "+Mathf.RoundToInt(Distance)+" m");
                foreach(var soldier in Soldiers)if(soldier!=null&&!soldier.IsDead&&!soldier.IsAlly&&soldier.Boss==null)soldier.Combat.DefensePoint=Frontline;
                Guards();nextReinforcement=Time.time+10f;
            }
            if(!spawning && Time.time>=nextReinforcement && Alive<AssaultLayout.MaxAlive)
            {spawning=true;nextReinforcement=Time.time+Random.Range(14f,20f);StartCoroutine(Reinforce());}
        }
        EnemySoldier Spawn(Vector3 point,bool post,EnemyRole role,bool roof=false)
        {
            var enemy=LevelBuilder.SpawnAssaultSoldier(gm,point,post,100+ordinal++,role,false,roof);
            Vector2 spread=Random.insideUnitCircle*6f;enemy.Combat.DefensePoint=Frontline+new Vector3(spread.x,0,spread.y);
            Soldiers.Add(enemy);return enemy;
        }
        void Guards()
        {
            for(int slot=0;slot<2;slot++)
            {
                if(Alive>=AssaultLayout.MaxAlive)return;
                var p=Frontline+new Vector3(slot==0?-2.5f:2.5f,0,10f);
                if(NavMesh.SamplePosition(p,out var nav,2f,NavMesh.AllAreas))Spawn(nav.position,false,slot==0?EnemyRole.MachineGunner:EnemyRole.Sniper);
            }
            // Choose a real building roof edge with an open line toward this route sector.
            foreach(var building in AssaultLayout.Data.buildings)
            {
                if(building.asset.StartsWith("town_") && building.asset!="town_command")continue; // Pitched roofs have no standing platform.
                if(Alive>=AssaultLayout.MaxAlive)return;
                if(Vector3.Distance(building.WorldPosition,Frontline)>42f)continue;
                Vector3 toward=(Frontline-building.WorldPosition).normalized;toward.y=0;
                for(int offset=8;offset<=14;offset+=2)
                {
                    var probe=building.WorldPosition+toward*offset+Vector3.up*50;
                    if(!Physics.Raycast(probe,Vector3.down,out var hit,46f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore) || hit.normal.y<.9f)continue;
                    if(hit.point.y<AssaultLayout.Ground+4f || hit.point.y>AssaultLayout.Ground+25f)continue;
                    var point=hit.point-toward*1.6f+Vector3.up*.05f;
                    Vector3 right=Vector3.Cross(Vector3.up,toward);
                    if(!Supported(point) || !Supported(hit.point+right*1.3f) || !Supported(hit.point-right*1.3f))continue;
                    if(Physics.Linecast(point+Vector3.up*2.3f,Frontline+Vector3.up*1.6f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))continue;
                    Spawn(point,true,Progress.Sector%2==0?EnemyRole.Sniper:EnemyRole.RocketTrooper,true);
                    var cover=UrbanProps.Place("Sandbag corner",transform,point+toward*1.6f,Quaternion.LookRotation(toward).eulerAngles.y);
                    cover.transform.localScale=new Vector3(1,1.5f/1.14f,1);return;
                }
            }
        }
        bool Supported(Vector3 point)
            => Physics.Raycast(point+Vector3.up*.6f,Vector3.down,out var support,1f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)
                && Mathf.Abs(support.point.y-point.y)<.16f;
        IEnumerator Reinforce()
        {
            int sector=Progress.Sector;int count=Random.Range(3,6);
            for(int i=0;i<count && gm.IsPlaying && !Progress.Complete && Alive<AssaultLayout.MaxAlive;i++)
            {
                if(sector!=Progress.Sector)break;
                if(FindEntrance(out var point))
                {
                    float roll=Random.value;
                    Spawn(point,false,roll<.15f?EnemyRole.RocketTrooper:roll<.3f?EnemyRole.Sniper:EnemyRole.MachineGunner);
                }
                yield return new WaitForSeconds(.45f);
            }
            spawning=false;
        }
        bool FindEntrance(out Vector3 point)
        {
            point=default;Physics.SyncTransforms();var path=new NavMeshPath();
            if(!NavMesh.SamplePosition(gm.Player.transform.position,out var target,3f,NavMesh.AllAreas))return false;
            for(int i=0;i<48;i++)
            {
                float angle=Random.Range(0,Mathf.PI*2),radius=Random.Range(26f,52f);
                Vector3 centre=Frontline;
                Vector3 candidate=centre+new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*radius;
                // Reinforcements come from the enemy district and its flanks, not behind the player's spawn.
                Vector3 advance=AssaultLayout.BossPosition-gm.Player.transform.position;advance.y=0;
                if(Vector3.Dot(candidate-gm.Player.transform.position,advance.normalized)<6f)continue;
                if(Mathf.Abs(candidate.x)>AssaultLayout.BoundaryX-4 || Mathf.Abs(candidate.z)>AssaultLayout.BoundaryZ-4)continue;
                if(!NavMesh.SamplePosition(candidate,out var nav,2f,NavMesh.AllAreas) || Vector3.Distance(nav.position,gm.Player.transform.position)<20f)continue;
                if(Physics.CheckCapsule(nav.position+Vector3.up*.55f,nav.position+Vector3.up*1.95f,.48f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))continue;
                var camera=gm.PlayerEye.GetComponent<Camera>();var view=camera.WorldToViewportPoint(nav.position+Vector3.up*1.8f);
                bool onScreen=view.z>0 && view.x>-.15f && view.x<1.15f && view.y>-.15f && view.y<1.15f;
                if(onScreen && (!Blocked(nav.position+Vector3.up*1.2f)||!Blocked(nav.position+Vector3.up*2.45f)))continue;
                bool crowded=false;foreach(var actor in Soldiers)
                    if(actor!=null&&!actor.IsDead&&Vector3.Distance(actor.transform.position,nav.position)<(allies.Contains(actor)?14f:2.2f)){crowded=true;break;}
                if(crowded || !NavMesh.CalculatePath(nav.position,target.position,NavMesh.AllAreas,path) || path.status!=NavMeshPathStatus.PathComplete)continue;
                point=nav.position;return true;
            }
            return false;
        }
        bool Blocked(Vector3 point)=>Physics.Linecast(gm.PlayerEye.position,point,out var hit,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)
            && hit.collider.GetComponentInParent<EnemySoldier>()==null;
        public void OnSoldierKilled(EnemySoldier enemy)
        {
            if(enemy.IsAlly || !gm.IsPlaying)return;
            if(enemy.Boss!=null){Progress.DefeatKing();return;}
            defeated++;
            int rockets=enemy.Role==EnemyRole.RocketTrooper || defeated%6==0?1:0;
            int supplied=gm.Player.ResupplyCombat(30,45,5,rockets);
            if(supplied>0)gm.Hud.Announce("적 탄약 확보 · 예비탄 +"+supplied+(rockets>0?" (로켓 포함)":""));
        }
        public void NotifyIncoming(EnemySoldier shooter,Vector3 from,Vector3 to)
        {
            Vector3 segment=to-from;
            foreach(var actor in Soldiers)
            {
                if(actor==null||actor.IsDead||actor.Combat==null||actor.IsAlly==shooter.IsAlly)continue;
                Vector3 body=actor.AimPoint;
                var nearest=from+segment*Mathf.Clamp01(Vector3.Dot(body-from,segment)/Mathf.Max(.0001f,segment.sqrMagnitude));
                if(Vector3.Distance(nearest,body)<2f && !EnemyProjectile.WorldHit(nearest-segment.normalized*.03f,body,actor,out _))actor.Combat.Suppress();
            }
        }
        IEnumerator CheckAfterStart(){yield return new WaitForSeconds(25f);if(gm.IsPlaying)ReportCombat();}
        public void ReportCombat()
        {
            int friendlyShots=0,enemyShots=0,moving=0;
            foreach(var actor in Soldiers)
            {
                if(actor==null||actor.Combat==null)continue;
                var combat=actor.Combat;
                if(actor.IsAlly)friendlyShots+=combat.ShotsFired;else enemyShots+=combat.ShotsFired;
                if(combat.Travelled>2f)moving++;
                if(actor.IsDead)continue;
                var agent=actor.GetComponent<NavMeshAgent>();
                if(!combat.Post && (agent==null||!agent.enabled||!agent.isOnNavMesh))Debug.LogError("[분대 검사] 이동 경로 연결 실패: "+actor.name+" "+actor.transform.position);
                if(combat.FireOpportunity>8f && combat.ShotsFired==0)Debug.LogWarning("[분대 검사] 사격 기회가 있으나 발사되지 않음: "+actor.name+" "+actor.transform.position);
            }
            Debug.Log("[분대 전투] 동료 생존 "+AlliesAlive+"/4 · 적 "+Alive+" · 이동한 병사 "+moving+" · 아군 발사 "+friendlyShots+" · 적 발사 "+enemyShots);
        }
    }
}
