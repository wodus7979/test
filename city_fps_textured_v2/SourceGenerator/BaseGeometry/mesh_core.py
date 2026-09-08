import math

def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a):
 l=math.sqrt(sum(x*x for x in a)); return tuple(x/l for x in a) if l else (0,1,0)
def dot(a,b):return sum(x*y for x,y in zip(a,b))

class Model:
 def __init__(self,name,label): self.name=name;self.label=label;self.parts=[]
 def part(self,name,mat):
  p={'name':name,'mat':mat,'p':[],'n':[],'uv':[]};self.parts.append(p);return p
 def tri(self,p,a,b,c,ns=None):
  n=norm(cross(sub(b,a),sub(c,a)))
  if sum(abs(x) for x in cross(sub(b,a),sub(c,a)))<1e-12:return
  for i,v in enumerate((a,b,c)):
   p['p'].extend(v);p['n'].extend(ns[i] if ns else n);p['uv'].extend((v[0]*4+v[2]*.71,v[1]*4+v[2]*.71))
 def quad(self,p,a,b,c,d,ns=None):
  self.tri(p,a,b,c,ns[:3] if ns else None);self.tri(p,a,c,d,[ns[0],ns[2],ns[3]] if ns else None)
 def profile(self,name,points,z,width,mat=0,bevel=.003):
  # Convex exterior panels, beveled along both exposed perimeter edges.
  if sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))<0:points=list(reversed(points))
  p=self.part(name,mat);cx=sum(v[0] for v in points)/len(points);cy=sum(v[1] for v in points)/len(points)
  inner=[]
  for x,y in points:
   d=math.hypot(x-cx,y-cy); k=max(.7,1-bevel/max(d,.001));inner.append((cx+(x-cx)*k,cy+(y-cy)*k))
  b=min(bevel,width*.24);rings=[[(x,y,z-width/2) for x,y in inner],[(x,y,z-width/2+b) for x,y in points],[(x,y,z+width/2-b) for x,y in points],[(x,y,z+width/2) for x,y in inner]]
  for lo,hi in zip(rings,rings[1:]):
   for i in range(len(points)):
    j=(i+1)%len(points);self.quad(p,lo[i],lo[j],hi[j],hi[i])
  for i in range(1,len(points)-1):
   self.tri(p,rings[0][0],rings[0][i+1],rings[0][i]);self.tri(p,rings[3][0],rings[3][i],rings[3][i+1])
  return p
 def box(self,name,c,s,mat=0,bevel=.002):
  x,y,z=c;a,b,w=s;a/=2;b/=2;q=min(bevel,a*.4,b*.4)
  pts=[(x-a+q,y-b),(x+a-q,y-b),(x+a,y-b+q),(x+a,y+b-q),(x+a-q,y+b),(x-a+q,y+b),(x-a,y+b-q),(x-a,y-b+q)]
  return self.profile(name,pts,z,w,mat,bevel)
 def cyl(self,name,a,b,r,mat=0,r2=None,steps=32,caps=True):
  p=self.part(name,mat);r2=r if r2 is None else r2;axis=norm(sub(b,a));u=norm(cross(axis,(0,1,0) if abs(axis[1])<.9 else (0,0,1)));v=cross(axis,u)
  rings=[];nr=[]
  for center,radius in [(a,r),(b,r2)]:
   ring=[]
   for i in range(steps):
    t=2*math.pi*i/steps;n=tuple(u[k]*math.cos(t)+v[k]*math.sin(t) for k in range(3));ring.append(tuple(center[k]+radius*n[k] for k in range(3)))
    if len(nr)<steps:nr.append(n)
   rings.append(ring)
  for i in range(steps):
   j=(i+1)%steps;self.quad(p,rings[0][i],rings[0][j],rings[1][j],rings[1][i],[nr[i],nr[j],nr[j],nr[i]])
   if caps:self.tri(p,a,rings[0][j],rings[0][i]);self.tri(p,b,rings[1][i],rings[1][j])
  return p
