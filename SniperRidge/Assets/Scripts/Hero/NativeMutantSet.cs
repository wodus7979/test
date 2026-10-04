using UnityEngine;

namespace SniperRidge
{
    // The four supplied FBXs share one mesh, bind skeleton and texture set.
    // No Humanoid retargeting, body sculpting or runtime joint correction is applied.
    public sealed class NativeMutantSet : ScriptableObject
    {
        public GameObject Model;
        public AnimationClip Transform, Punch, Jump, Run;
        public AnimationClip Idle, Hit, Block, Clap, JumpDown;
        public Vector3 IdleStart, IdleEnd;
        public float Scale=1, GroundOffset, RunStride;
        public Vector3 RunStart,RunEnd;
        public float JumpTakeoff=1.2f,JumpApex=1.5f,JumpLanding=1.9f;
        public AnimationCurve JumpRootLift;
        public float DropTakeoff=1f,DropApex=1.17f,DropLanding=1.633333f;
        public bool FourActionsOnly=true;
    }
}
