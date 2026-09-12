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
        bool entered;
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
            if(entered && Progress.WaveDue && Alive<=6 && Time.time>=nextWaveRetry)
            {
                nextWaveRetry=Time.time+1f;
                if(SpawnWave())Progress.SentWave();
            }
            if(Progress.TryAdvance(Alive))
            {
                foreach(var enemy in squad)if(enemy!=null)Destroy(enemy.gameObject);
                squad.Clear();
                if(Progress.Complete){beacon.SetActive(false);gm.CompleteAssault();return;}
                gm.Player.Resupply(300);gm.Player.ResupplyRockets(2);gm.Player.Grenades.Resupply(2);gm.Health.Configure(5f,10f);
                entered=false;MoveMarker();
                gm.Hud.Announce("구역 확보 · 탄약/수류탄 보급 · 다음 목표: "+ObjectiveName);
            }
        }
        bool SpawnWave()
        {
            int wave=Progress.WavesSent;
            var positions=new List<Vector3>();
            var coverFlags=new List<bool>();
            int count=wave==0?4:3;
            for(int i=0;i<count;i++)
            {
                bool cover=wave==0 && i<2;
                Vector3 candidate=cover?AssaultLayout.CoverPost(Progress.Sector,i):AssaultLayout.Entry(Progress.Sector,wave,i%3);
                if(Vector3.Distance(candidate,gm.Player.transform.position)<20f)
                {
                    cover=false;float side=gm.Player.transform.position.z>Objective.z?-1f:1f;
                    candidate=Objective+new Vector3((i-1.5f)*3f,0,side*(48+i*3));
                }
                if(!NavMesh.SamplePosition(candidate,out var nav,3f,NavMesh.AllAreas))return false;
                if(Vector3.Distance(nav.position,gm.Player.transform.position)<15f)return false;
                positions.Add(nav.position);coverFlags.Add(cover);
            }
            for(int i=0;i<count;i++)
            {
                bool cover=coverFlags[i];
                var enemy=LevelBuilder.SpawnAssaultSoldier(gm,positions[i],cover,Progress.Sector*100+wave*10+i);
                squad.Add(enemy);
            }
            return true;
        }
    }
}
