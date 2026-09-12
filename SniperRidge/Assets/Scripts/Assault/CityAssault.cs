using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    public sealed class CityAssault:MonoBehaviour
    {
        public readonly AssaultProgress Progress=new AssaultProgress();
        readonly List<EnemySoldier> squad=new List<EnemySoldier>();
        GameManager gm;
        GameObject beacon;
        LineRenderer ring;
        float nextWaveRetry;
        bool entered,spawning;
        public int Alive { get {int n=0;foreach(var e in squad)if(e!=null&&!e.IsDead)n++;return n;} }
        public Vector3 Objective => AssaultLayout.Objectives[Mathf.Min(Progress.Sector,AssaultLayout.Objectives.Length-1)];
        public float Distance => Vector3.Distance(gm.Player.transform.position,Objective);
        public bool InArea => Distance<=AssaultLayout.CaptureRadius;
        public string ObjectiveName => AssaultLayout.Names[Mathf.Min(Progress.Sector,AssaultLayout.Names.Length-1)];
        public static CityAssault Create(GameManager game)
        {
            var assault=new GameObject("Urban assault objectives").AddComponent<CityAssault>();assault.gm=game;
            assault.beacon=new GameObject("Objective marker");assault.beacon.transform.SetParent(assault.transform);
            assault.ring=assault.beacon.AddComponent<LineRenderer>();assault.ring.useWorldSpace=true;assault.ring.loop=true;assault.ring.positionCount=64;
            assault.ring.startWidth=assault.ring.endWidth=.08f;assault.ring.sharedMaterial=Effects.Unlit(new Color(.9f,.7f,.27f));
            assault.MoveMarker();return assault;
        }
        void MoveMarker()
        {
            for(int i=0;i<64;i++)
            {
                float a=i*Mathf.PI*2/64;ring.SetPosition(i,Objective+new Vector3(Mathf.Sin(a)*8,.035f,Mathf.Cos(a)*8));
            }
        }
        void Update()
        {
            if(!gm.IsPlaying||Progress.Complete)return;
            if(InArea && !entered){entered=true;gm.Hud.Announce(ObjectiveName+" · 통신 거점 확보 시작 · 적 증원을 막으세요");}
            Progress.Tick(Time.deltaTime,InArea);
            if(entered && !spawning && Progress.WaveDue && Alive+AssaultLayout.WaveSize(Progress.WavesSent)<=AssaultLayout.MaxAlive && Time.time>=nextWaveRetry)
            {
                nextWaveRetry=Time.time+1f;
                int wave=Progress.WavesSent;
                var positions=FindEntrances(wave,AssaultLayout.WaveSize(wave));
                if(positions!=null)
                {
                    Progress.SentWave();spawning=true;
                    StartCoroutine(SpawnWave(wave,positions));
                }
            }
            if(!spawning && Progress.TryAdvance(Alive))
            {
                foreach(var enemy in squad)if(enemy!=null)Destroy(enemy.gameObject);
                squad.Clear();
                if(Progress.Complete){beacon.SetActive(false);gm.CompleteAssault();return;}
                gm.Player.Resupply(300);gm.Player.ResupplyRockets(2);gm.Player.Grenades.Resupply(2);gm.Health.Configure(5f,10f);
                entered=false;MoveMarker();
                gm.Hud.Announce("구역 확보 · 탄약/수류탄 보급 · 다음 목표: "+ObjectiveName);
            }
        }
        List<Vector3> FindEntrances(int wave,int count)
        {
            Physics.SyncTransforms();
            var positions=new List<Vector3>();
            if(!NavMesh.SamplePosition(gm.Player.transform.position,out var target,3,NavMesh.AllAreas))return null;
            var path=new NavMeshPath();
            for(int slot=0;slot<12 && positions.Count<count;slot++)
            {
                var candidate=AssaultLayout.Entry(Progress.Sector,wave,slot);
                if(!NavMesh.SamplePosition(candidate,out var nav,1f,NavMesh.AllAreas))continue;
                if(!CanSpawnHere(nav.position))continue;
                bool crowded=false;
                foreach(var reserved in positions)if(Vector3.Distance(reserved,nav.position)<1.35f)crowded=true;
                if(crowded || !NavMesh.CalculatePath(nav.position,target.position,NavMesh.AllAreas,path) || path.status!=NavMeshPathStatus.PathComplete)continue;
                positions.Add(nav.position);
            }
            return positions.Count==count?positions:null;
        }
        bool CanSpawnHere(Vector3 position)
        {
            if(Vector3.Distance(position,gm.Player.transform.position)<14f || !Concealed(position))return false;
            if(Physics.CheckCapsule(position+Vector3.up*.55f,position+Vector3.up*1.95f,.48f,
                EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))return false;
            foreach(var enemy in squad)
                if(enemy!=null&&!enemy.IsDead&&Vector3.Distance(enemy.transform.position,position)<2f)return false;
            return true;
        }
        bool Concealed(Vector3 position)
        {
            var camera=gm.PlayerEye.GetComponent<Camera>();
            Vector3 chest=position+Vector3.up*1.3f,head=position+Vector3.up*2.45f;
            if(camera!=null && OutsideView(camera,chest) && OutsideView(camera,head))return true;
            return Blocked(chest) && Blocked(head);
        }
        static bool OutsideView(Camera camera,Vector3 point)
        {
            var view=camera.WorldToViewportPoint(point);
            return view.z<=0 || view.x<-.12f || view.x>1.12f || view.y<-.12f || view.y>1.12f;
        }
        bool Blocked(Vector3 point)
        {
            return Physics.Linecast(gm.PlayerEye.position,point,out var hit,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore)
                && hit.collider.GetComponentInParent<EnemySoldier>()==null;
        }
        IEnumerator SpawnWave(int wave,List<Vector3> positions)
        {
            if(wave>0)gm.Hud.Announce("골목에서 적 분대 접근 · "+positions.Count+"명");
            for(int i=0;i<positions.Count;i++)
            {
                if(!gm.IsPlaying)break;
                // Recheck both visibility and occupancy after each staggered spawn.
                Physics.SyncTransforms();
                var point=positions[i];
                while(gm.IsPlaying && !CanSpawnHere(point))
                {
                    var alternative=FindEntrances(wave+i,1);
                    if(alternative!=null){point=alternative[0];break;}
                    yield return new WaitForSeconds(.25f);
                }
                if(!gm.IsPlaying)break;
                var enemy=LevelBuilder.SpawnAssaultSoldier(gm,point,false,Progress.Sector*100+wave*10+i);
                squad.Add(enemy);
                yield return new WaitForSeconds(.32f);
            }
            spawning=false;
        }
    }
}
