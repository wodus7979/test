using System;
using UnityEngine;

namespace SniperRidge
{
    public static class AssaultLayout
    {
        public const float Ground=12f, CaptureRadius=18f, SecureSeconds=100f;
        public const int Waves=5, MaxAlive=12;
        public const float EnemyScale=1.35f;
        [Serializable] public class Point { public float x,z; public Vector3 Position=>new Vector3(x,Ground,z); }
        [Serializable] public class Objective:Point { public string name; }
        [Serializable] public class Placement:Point { public string asset;public float y,yaw;public bool original;public Vector3 WorldPosition=>new Vector3(x,y,z); }
        [Serializable] public class Layout { public float size,boundary;public Point start;public Objective[] objectives;public Placement[] buildings,props; }
        static Layout data;
        static Vector3[] objectives;
        static string[] names;
        public static Layout Data
        {
            get
            {
                if(data==null)
                {
                    var file=Resources.Load<TextAsset>("Maps/urban_assault");
                    if(file==null)throw new InvalidOperationException("도시 FPS 배치 파일 누락");
                    data=JsonUtility.FromJson<Layout>(file.text);
                    objectives=new Vector3[data.objectives.Length];names=new string[data.objectives.Length];
                    for(int i=0;i<objectives.Length;i++){objectives[i]=data.objectives[i].Position;names[i]=data.objectives[i].name;}
                }
                return data;
            }
        }
        public static float Size=>Data.size;
        public static float BoundaryX=>Data.boundary;
        public static float BoundaryZ=>Data.boundary;
        public static Vector3 Start=>Data.start.Position;
        public static Vector3[] Objectives { get {var layout=Data;return objectives;} }
        public static string[] Names { get {var layout=Data;return names;} }
        public static int WaveSize(int wave)=>wave==0?6:5;
        public static Vector3 CoverPost(int sector,int slot)
            =>Objectives[sector]+new Vector3(slot%2==0?-2.8f:2.8f,0,slot<2?13f:-13f);
        // Four courtyard/cross-street entrances. Staggering three positions keeps a squad from stacking.
        public static Vector3 Entry(int sector,int wave,int slot)
        {
            int entrance=(wave+slot/3)%4;
            return Objectives[sector]+new Vector3((entrance%2==0?-36f:36f)+(slot%3-1)*1.6f,0,entrance<2?-36f:36f);
        }

    }

    /// <summary>Sequential objective clock: only time spent in the active area advances it.</summary>
    public sealed class AssaultProgress
    {
        public int Sector { get; private set; }
        public float Secured { get; private set; }
        public int WavesSent { get; private set; }
        public bool Complete => Sector>=AssaultLayout.Objectives.Length;
        public bool WaveDue => !Complete && WavesSent<AssaultLayout.Waves && Secured>=WavesSent*20f;
        public void SentWave() { if(WaveDue)WavesSent++; }
        public void Tick(float dt,bool inArea)
        {
            if(!Complete && inArea)Secured=Mathf.Min(AssaultLayout.SecureSeconds,Secured+Mathf.Max(0,dt));
        }
        public bool TryAdvance(int alive)
        {
            if(Complete || Secured<AssaultLayout.SecureSeconds || WavesSent<AssaultLayout.Waves || alive>0)return false;
            Sector++;Secured=0;WavesSent=0;return true;
        }
    }
}
