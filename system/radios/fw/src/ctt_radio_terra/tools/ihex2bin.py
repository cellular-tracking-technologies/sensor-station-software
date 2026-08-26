import sys
data={}
for ln in open(sys.argv[1]):
    ln=ln.strip()
    if not ln.startswith(':'): continue
    b=bytes.fromhex(ln[1:])
    n,addr,rt=b[0],(b[1]<<8)|b[2],b[3]
    if rt==0:
        for i,v in enumerate(b[4:4+n]): data[addr+i]=v
    elif rt==1: break
lo,hi=min(data),max(data)
out=bytearray(b'\xff'*(hi-lo+1))
for a,v in data.items(): out[a-lo]=v
open(sys.argv[2],'wb').write(out)
print(f"base=0x{lo:04x} size={len(out)}")
