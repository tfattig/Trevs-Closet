import Link from 'next/link';
import CreateItem from '../components/CreateItem';
import PleaseSingin from '../components/PleaseSignin';

const Sell = props => (
    <div>
        <PleaseSingin>
            <CreateItem />
        </PleaseSingin>
    </div>
)

export default Sell;