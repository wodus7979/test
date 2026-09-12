using System;
using UnityEngine;

namespace SniperRidge
{
    public static class AssaultLayout
    {
        public const float Ground=12f;
        public const int MaxAlive=24;
        public const float EnemyScale=1.35f;
        [Serializable] public class Point { public float x,z; public Vector3 Position=>new Vector3(x,Ground,z); }
        [Serializable] public class Objective:Point { public string name; }
        [Serializable] public class Placement:Point { public string asset;public float y,yaw;public bool original;public Vector3 WorldPosition=>new Vector3(x,y,z); }
        [Serializable] public class Greenery:Point { public float scale;public bool pine; }
        [Serializable] public class Layout { public string theme;public float size,boundary;public Point start;public Objective[] objectives;public Placement[] buildings,props;public Greenery[] greenery; }
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
        public static Vector3 BossPosition=>new Vector3(0,Ground,132f);
        public static Vector3[] Objectives { get {var layout=Data;return objectives;} }
        public static string[] Names { get {var layout=Data;return names;} }
        public static Vector3 CoverPost(int sector,int slot)
            =>Objectives[sector]+new Vector3(slot%2==0?-2.8f:2.8f,0,slot<2?13f:-13f);
        // Representative route samples for layout validation; live reinforcements choose random locations.
        public static Vector3 ApproachSample(int sector,int slot)
        {
            int entrance=slot/3;
            return Objectives[sector]+new Vector3((entrance%2==0?-36f:36f)+(slot%3-1)*1.6f,0,entrance<2?-36f:36f);
        }

    }

    /// <summary>Route milestones only pace defenders. Only defeating the king wins.</summary>
    public sealed class AssaultProgress
    {
        public int Sector { get; private set; }
        public bool Complete { get; private set; }
        public bool Advance(Vector3 player)
        {
            int before=Sector;
            while(Sector<AssaultLayout.Objectives.Length-1 && player.z>=AssaultLayout.Objectives[Sector].z+6f)Sector++;
            return Sector!=before;
        }
        public void DefeatKing(){Complete=true;}
    }
}
